import { randomInt, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { documentIdentifiers, editorialDecisions, importBatches, normNodes, normVersions, norms, sourceBudgets, sourceCache, sourceDocuments, sourceObservations, sourcePolicies, sourceLeases } from "@/db/schema";
import { FilesystemRawStorage } from "@/ingestion/storage/filesystem";
import { createSourceResolver } from "@/sources/resolver";
import { acquireLease, releaseLease } from "@/sources/leases";
import { createDiscoveryService } from "@/sources/discovery";
import type { LegalSourceConnector, SourceDocument, SourceFetch, SourceReference } from "@/sources/types";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
const fixtures: { sourceKey: string; directory: string }[] = [];

async function fixture() {
  const sourceKey = `resolver-test-${randomUUID()}`;
  const directory = await mkdtemp(join(tmpdir(), "legisdata-resolver-test-"));
  fixtures.push({ sourceKey, directory });
  const sourceIdentifier = String(randomInt(100_000_000_000, 900_000_000_000));
  let time = Date.parse("2026-09-27T12:00:00.000Z");
  const now = () => new Date(time);
  const document: SourceDocument = {
    sourceIdentifier, type: "Ley", number: sourceIdentifier, title: "Documento sintético para pruebas del resolvedor",
    publishedAt: "2020-01-02", versionDate: "2024-01-02", status: "desconocida", sourceStatus: "no derogado",
    organisms: ["Organismo ficticio de pruebas"], warnings: [],
    coverage: { inputParts: 2, representedParts: 2, inputTexts: 2, representedTexts: 2, unsupported: [] },
    nodes: [
      { stableKey: "chapter-1", sourcePartId: "1", type: "capitulo", label: "Capítulo I", title: null, text: "Capítulo sintético", position: 0, parentStableKey: null },
      { stableKey: "article-1", sourcePartId: "2", type: "articulo", label: "Artículo único", title: null, text: "Texto original sintético.", position: 1, parentStableKey: "chapter-1" },
    ],
  };
  const response = (revision = 1): SourceFetch => ({
    kind: "modified", url: `https://example.invalid/norms/${sourceIdentifier}`, capturedAt: now().toISOString(),
    etag: `"revision-${revision}"`, lastModified: "Tue, 02 Jan 2024 00:00:00 GMT",
    raw: `<SyntheticDocument id="${sourceIdentifier}" revision="${revision}"/>`,
  });
  const fetch = vi.fn<LegalSourceConnector["fetch"]>(async () => response());
  const normalize = vi.fn<LegalSourceConnector["normalize"]>(() => structuredClone(document));
  const connector: LegalSourceConnector = { key: sourceKey, name: "Synthetic integration source", parserVersion: "integration-v1", parseReference: () => null, fetch, normalize };
  const storage = new FilesystemRawStorage(directory);
  const options = { connector, storage, now, ttlMs: 10_000, negativeTtlMs: 1_000, minIntervalMs: 0 };
  const reference: SourceReference = { kind: "idNorma", value: sourceIdentifier };
  return { sourceKey, sourceIdentifier, connector, document, response, fetch, normalize, storage, options, reference,
    resolve: createSourceResolver(options), now, advance: (milliseconds: number) => { time += milliseconds; } };
}

async function persisted(sourceKey: string) {
  const db = getDb();
  const sources = await db.select().from(sourceDocuments).where(eq(sourceDocuments.sourceKey, sourceKey));
  const identities = await db.select().from(documentIdentifiers).where(eq(documentIdentifiers.sourceKey, sourceKey));
  const versions = identities.length ? await db.select().from(normVersions).where(inArray(normVersions.normId, identities.map((identity) => identity.normId))) : [];
  const batches = sources.length ? await db.select().from(importBatches).where(inArray(importBatches.sourceDocumentId, sources.map((source) => source.id))) : [];
  const observations = await db.select().from(sourceObservations).where(and(eq(sourceObservations.sourceKey, sourceKey), eq(sourceObservations.eventKind, "upstream"))).orderBy(asc(sourceObservations.observedAt));
  const cache = await db.select().from(sourceCache).where(eq(sourceCache.sourceKey, sourceKey));
  return { sources, identities, versions, batches, observations, cache };
}

describe.skipIf(!databaseAvailable)("on-demand resolver with PostgreSQL and durable raw storage", () => {
  afterEach(async () => {
    const db = getDb();
    for (const { sourceKey, directory } of fixtures.splice(0)) {
      try {
        await db.transaction(async (tx) => {
          const identities = await tx.select().from(documentIdentifiers).where(eq(documentIdentifiers.sourceKey, sourceKey));
          const sources = await tx.select().from(sourceDocuments).where(eq(sourceDocuments.sourceKey, sourceKey));
          await tx.delete(sourceCache).where(eq(sourceCache.sourceKey, sourceKey));
          await tx.delete(sourceObservations).where(eq(sourceObservations.sourceKey, sourceKey));
          if (sources.length) await tx.delete(importBatches).where(inArray(importBatches.sourceDocumentId, sources.map((source) => source.id)));
          await tx.delete(documentIdentifiers).where(eq(documentIdentifiers.sourceKey, sourceKey));
          if (identities.length) await tx.delete(norms).where(inArray(norms.id, identities.map((identity) => identity.normId)));
          await tx.delete(sourceDocuments).where(eq(sourceDocuments.sourceKey, sourceKey));
          await tx.delete(sourcePolicies).where(eq(sourcePolicies.sourceKey, sourceKey));
          await tx.delete(sourceBudgets).where(eq(sourceBudgets.sourceKey, sourceKey));
          await tx.delete(sourceLeases).where(eq(sourceLeases.sourceKey, sourceKey));
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });
  afterAll(closeDb);

  it("coalesces concurrent requests, serves a cache hit and records 304 without a duplicate proposal", async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    f.fetch.mockImplementationOnce(async () => { await gate; return f.response(); });
    const otherResolver = createSourceResolver(f.options);
    const requests = [f.resolve(f.reference), f.resolve(f.reference), otherResolver(f.reference)];
    release();
    const resolutions = await Promise.all(requests);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    for (const result of resolutions) {
      expect(result).toMatchObject({ status: "pending_review", cache: "fetched" });
      expect(result).not.toHaveProperty("nodes");
      expect(result).not.toHaveProperty("raw");
    }
    const initial = await persisted(f.sourceKey);
    expect(initial.sources).toHaveLength(1);
    expect(initial.versions).toHaveLength(1);
    expect(initial.batches).toHaveLength(1);
    expect(initial.versions[0]).toMatchObject({ publicationStatus: "pending_review", isCurrent: false, validFrom: null });
    expect((await f.storage.get(initial.sources[0].storageKey!)).content).toBe(f.response().raw);
    const nodes = await getDb().select().from(normNodes).where(eq(normNodes.versionId, initial.versions[0].id));
    expect(nodes.find((node) => node.stableKey === "article-1")?.parentId).toBe(nodes.find((node) => node.stableKey === "chapter-1")?.id);
    const decisions = await getDb().select().from(editorialDecisions).where(eq(editorialDecisions.batchId, initial.batches[0].id));
    expect(decisions.map((decision) => decision.action)).toEqual(["submit_review"]);

    expect(await f.resolve(f.reference)).toMatchObject({ status: "pending_review", cache: "hit" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    f.advance(10_001);
    f.fetch.mockResolvedValueOnce({ kind: "not-modified", url: f.response().url, capturedAt: f.now().toISOString(), etag: '"revision-1"' });
    expect(await f.resolve(f.reference)).toMatchObject({ status: "pending_review", cache: "revalidated", checkedAt: f.now().toISOString() });
    expect(f.fetch).toHaveBeenLastCalledWith(f.reference, { etag: '"revision-1"', lastModified: "Tue, 02 Jan 2024 00:00:00 GMT" });
    const revalidated = await persisted(f.sourceKey);
    expect(revalidated.sources.map((source) => source.id)).toEqual(initial.sources.map((source) => source.id));
    expect(revalidated.versions.map((version) => version.id)).toEqual(initial.versions.map((version) => version.id));
    expect(revalidated.batches).toHaveLength(1);
    expect(revalidated.observations.map((observation) => observation.outcome)).toEqual(["captured", "not_modified"]);
  });

  it("expires negative results and does not misreport a subsequent timeout as confirmed absence", async () => {
    const f = await fixture();
    f.fetch.mockRejectedValueOnce(Object.assign(new Error("synthetic missing document"), { kind: "not-found", httpStatus: 404 }));
    expect(await f.resolve(f.reference)).toMatchObject({ status: "not_found", cache: "negative" });
    expect(await f.resolve(f.reference)).toMatchObject({ status: "not_found", cache: "negative" });
    expect(f.fetch).toHaveBeenCalledTimes(1);

    f.advance(1_001);
    f.fetch.mockRejectedValueOnce(Object.assign(new Error("synthetic timeout"), { kind: "timeout" }));
    expect(await f.resolve(f.reference)).toMatchObject({ status: "unavailable" });
    expect(await f.resolve(f.reference)).toMatchObject({ status: "unavailable" });
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect((await persisted(f.sourceKey)).sources).toHaveLength(0);
    f.advance(30_001);
    expect(await f.resolve(f.reference)).toMatchObject({ status: "pending_review", cache: "fetched" });
    expect(f.fetch).toHaveBeenCalledTimes(3);
    expect((await persisted(f.sourceKey)).observations.map((observation) => observation.outcome)).toEqual(["not-found", "timeout", "captured"]);
  });

  it.each(["missing publication metadata", "wrong source identifier", "wrong law number", "malformed representation"] as const)("retains private evidence for %s without creating a document identity or version", async (problem) => {
    const f = await fixture();
    let reference = f.reference;
    if (problem === "missing publication metadata") f.document.publishedAt = null;
    if (problem === "wrong source identifier") f.document.sourceIdentifier = "123";
    if (problem === "wrong law number") { f.document.number = "123"; reference = { kind: "idLey", value: f.sourceIdentifier }; }
    if (problem === "malformed representation") f.normalize.mockImplementation(() => { throw new Error("synthetic malformed payload"); });
    expect(await f.resolve(reference)).toMatchObject({ status: "unavailable", reason: "invalid_document" });
    const state = await persisted(f.sourceKey);
    expect(state.sources).toHaveLength(1);
    expect(state.identities).toHaveLength(0);
    expect(state.versions).toHaveLength(0);
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0]).toMatchObject({ status: "validation_failed", proposedVersionId: null });
    expect(state.observations).toHaveLength(1);
    expect(state.observations[0].outcome).toBe("invalid_document");
  });

  it("keeps the approved current version available while a changed capture waits for review", async () => {
    const f = await fixture();
    await f.resolve(f.reference);
    const initial = await persisted(f.sourceKey);
    const published = initial.versions[0];
    // Prepare an already reviewed publication; this test exercises resolver behavior, not publication authorization.
    await getDb().insert(sourcePolicies).values({ sourceKey: f.sourceKey, publicationAllowed: true, evidenceUrl: "https://example.invalid/synthetic-usage-policy", reviewedAt: new Date(Date.now() - 60_000), reviewedBy: "integration-test" });
    await getDb().update(normVersions).set({ publicationStatus: "published", isCurrent: true, publishedAt: f.now(), publishedBy: "integration-test" }).where(eq(normVersions.id, published.id));
    await getDb().update(importBatches).set({ status: "published", publishedAt: f.now(), publishedBy: "integration-test" }).where(eq(importBatches.id, initial.batches[0].id));
    expect(await f.resolve(f.reference)).toMatchObject({ status: "published", cache: "hit", versionId: published.id });

    f.advance(10_001);
    f.document.versionDate = "2025-02-03";
    f.document.nodes[1].text = "Texto sintético modificado, todavía pendiente.";
    f.fetch.mockResolvedValueOnce(f.response(2));
    expect(await f.resolve(f.reference)).toMatchObject({ status: "published", cache: "stale", reason: "update_pending_review", versionId: published.id });
    const updated = await persisted(f.sourceKey);
    expect(updated.sources).toHaveLength(2);
    expect(updated.versions).toHaveLength(2);
    expect(updated.versions.find((version) => version.id === published.id)).toMatchObject({ isCurrent: true, publicationStatus: "published", validTo: null });
    const proposal = updated.versions.find((version) => version.id !== published.id)!;
    expect(proposal).toMatchObject({ isCurrent: false, publicationStatus: "pending_review", validFrom: null });
    const publicNodes = await getDb().select().from(normNodes).where(eq(normNodes.versionId, published.id));
    expect(publicNodes.find((node) => node.stableKey === "article-1")?.text).toBe("Texto original sintético.");
    expect(updated.cache[0].sourceDocumentId).toBe(proposal.sourceDocumentId);
  });

  it("resolves a discovered candidate once and reuses its proven ID and law-number aliases", async () => {
    const f = await fixture();
    const discover = createDiscoveryService({ now: f.now, minIntervalMs: 0, enabled: () => true, connector: { key: f.sourceKey, version: "test-v1", discover: async () => ({ discarded: 0, candidates: [{ source: f.sourceKey, resourceUri: "https://datos.bcn.cl/recurso/test", externalId: f.sourceIdentifier, reference: f.reference, title: f.document.title, match: { strategy: "title", fields: ["title"] }, provenance: { endpoint: "https://datos.bcn.cl/sparql", observedAt: f.now().toISOString(), adapterVersion: "test-v1" } }] }) } });
    const candidates = await discover("norma sintética");
    expect(f.fetch).not.toHaveBeenCalled();
    expect((await persisted(f.sourceKey)).sources).toHaveLength(0);
    const aliases: SourceReference[] = [candidates.candidates[0].reference!, { kind: "idLey", value: f.sourceIdentifier }];
    expect(await f.resolve(aliases[0])).toMatchObject({ status: "pending_review", cache: "fetched" });
    expect(await f.resolve(aliases[1])).toMatchObject({ status: "pending_review", cache: "hit" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const state = await persisted(f.sourceKey);
    expect(state.sources).toHaveLength(1);
    expect(state.identities).toHaveLength(1);
    expect(state.versions).toHaveLength(1);
    expect(state.batches).toHaveLength(1);
    const resolutionCache = state.cache.filter((entry) => entry.operation === "resolve");
    expect(resolutionCache).toHaveLength(2);
    expect(new Set(resolutionCache.map((entry) => entry.sourceDocumentId)).size).toBe(1);
  });

  it("shares provider backoff between different document references", async () => {
    const f = await fixture();
    f.fetch.mockRejectedValueOnce(Object.assign(new Error("synthetic rate limit"), { kind: "rate-limit", httpStatus: 429, retryAfterMs: 120_000 }));
    expect(await f.resolve(f.reference)).toMatchObject({ status: "unavailable", retryAfterSeconds: 120 });
    expect(await f.resolve({ kind: "idNorma", value: String(Number(f.sourceIdentifier) + 1) })).toMatchObject({ status: "unavailable", reason: "source_backoff", retryAfterSeconds: 120 });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps HTTP and immutable storage outside transactions and rejects a replaced owner's result", async () => {
    const f = await fixture();
    let unblock!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((done) => { unblock = done; });
    const started = new Promise<void>((done) => { entered = done; });
    f.fetch.mockImplementationOnce(async () => { entered(); await gate; return f.response(); });
    const pending = f.resolve(f.reference);
    await started;
    try {
      const activity = await getDb().execute(sql`select count(*)::int as count from pg_stat_activity where datname = current_database() and state = 'idle in transaction' and query like '%source_%'`);
      expect(activity[0].count).toBe(0);
      const other = await createSourceResolver(f.options)({ kind: "idLey", value: f.sourceIdentifier });
      expect(other).toMatchObject({ status: "resolving", reason: "in_progress" });
      f.advance(30_001);
      const next = await getDb().transaction((tx) => acquireLease(tx, "replacement", f.sourceKey, f.now(), 0));
      expect(next).toHaveProperty("lease");
      const put = vi.spyOn(f.storage, "put").mockImplementation(async () => {
        const state = await getDb().execute(sql`select count(*)::int as count from pg_stat_activity where datname = current_database() and state = 'idle in transaction' and query like '%source_%'`);
        expect(state[0].count).toBe(0);
        return { key: "unused", checksum: "unused", size: 1 } as never;
      });
      unblock();
      expect(await pending).toMatchObject({ status: "resolving", reason: "lease_expired" });
      expect((await persisted(f.sourceKey)).sources).toHaveLength(0);
      expect(put).toHaveBeenCalledOnce();
      put.mockRestore();
      if ("lease" in next) await getDb().transaction((tx) => releaseLease(tx, next.lease));
      expect(await f.resolve(f.reference)).toMatchObject({ status: "pending_review", cache: "fetched" });
    } finally { unblock(); await pending; }
  });
});
