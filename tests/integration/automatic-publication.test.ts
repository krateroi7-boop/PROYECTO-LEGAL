import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomInt } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { getDb, closeDb } from "@/db/client";
import { auditLogs, documentIdentifiers, editorialDecisions, importBatches, normNodes, normVersions, norms, sourceBudgets, sourceCache, sourceDocuments, sourceLeases, sourceObservations, sourcePolicies } from "@/db/schema";
import { bcnConnector } from "@/sources/bcn";
import { createSourceResolver } from "@/sources/resolver";
import { requestIngestion, readIngestionState } from "@/sources/ingestion-service";
import { consumeIngestionQuota } from "@/sources/ingestion-quota";
import { FilesystemRawStorage } from "@/ingestion/storage/filesystem";
import { COMMERCIAL_FULLTEXT_SCOPE } from "@/ingestion/editorial/source-policy";
import { publishPreparedBatch, verifyPublicationOriginal } from "@/ingestion/editorial/publication";
import { approveImportBatch, publishImportBatch, rejectImportBatch } from "@/ingestion/editorial/workflow";
import { getApiNormDetail } from "@/db/repositories/api";
import { searchPersisted } from "@/db/repositories/search";
import { completeXml } from "../helpers/complete-xml";
const fixtures: { key: string; dir: string; user: string }[] = [];
async function fixture(mode: "manual_review" | "auto_publish_validated" = "auto_publish_validated") {
  const key = `mvp-test-${randomUUID()}`, id = String(randomInt(100000000000, 900000000000)), user = `mvp-account-${randomUUID()}`;
  const dir = await mkdtemp(join(tmpdir(), "legisdata-mvp-")); fixtures.push({ key, dir, user });
  vi.stubEnv("LEGISDATA_STORAGE_ROOT", dir);
  let raw = completeXml.replaceAll("987654", id);
  const fetch = vi.fn(async () => ({ kind: "modified" as const, raw, capturedAt: new Date().toISOString(), url: "https://example.test/synthetic" }));
  const connector = { ...bcnConnector, key, name: "Synthetic XML source", fetch };
  const reference = { kind: "idNorma" as const, value: id };
  await getDb().insert(sourcePolicies).values({ sourceKey: key, publicationAllowed: true, publicationMode: mode, usageScope: COMMERCIAL_FULLTEXT_SCOPE, evidenceUrl: "https://example.test/synthetic-permission", reviewedBy: "test-reviewer", reviewedAt: new Date("2020-01-01") });
  return { key, id, dir, user, connector, reference, fetch, storage: new FilesystemRawStorage(dir), raw, setRaw: (value: string) => { raw = value; } };
}
describe.skipIf(!process.env.DATABASE_URL)("validated publication and authenticated acquisition", () => {
  afterEach(async () => {
    vi.unstubAllEnvs(); const db = getDb();
    for (const f of fixtures.splice(0)) {
      const sources = await db.select().from(sourceDocuments).where(eq(sourceDocuments.sourceKey, f.key));
      const identities = await db.select().from(documentIdentifiers).where(eq(documentIdentifiers.sourceKey, f.key));
      const batches = sources.length ? await db.select().from(importBatches).where(inArray(importBatches.sourceDocumentId, sources.map((s) => s.id))) : [];
      if (batches.length) await db.delete(auditLogs).where(inArray(auditLogs.entityId, batches.map((b) => b.id)));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, f.user));
      await db.delete(sourceCache).where(eq(sourceCache.sourceKey, f.key)); await db.delete(sourceObservations).where(eq(sourceObservations.sourceKey, f.key));
      if (batches.length) await db.delete(importBatches).where(inArray(importBatches.id, batches.map((b) => b.id)));
      await db.delete(documentIdentifiers).where(eq(documentIdentifiers.sourceKey, f.key));
      if (identities.length) await db.delete(norms).where(inArray(norms.id, identities.map((i) => i.normId)));
      await db.delete(sourceDocuments).where(eq(sourceDocuments.sourceKey, f.key)); await db.delete(sourcePolicies).where(eq(sourcePolicies.sourceKey, f.key));
      await db.delete(sourceLeases).where(eq(sourceLeases.sourceKey, f.key)); await db.delete(sourceBudgets).where(eq(sourceBudgets.sourceKey, f.key));
      await rm(f.dir, { recursive: true, force: true });
    }
  });
  afterAll(closeDb);
  it("publishes complete XML atomically; 100 concurrent requests acquire once and consume one quota", async () => {
    const f = await fixture();
    const requests = Array.from({ length: 100 }, () => requestIngestion(f.connector, f.reference, { kind: "account", account: { id: f.user } }, { storage: f.storage }));
    const results = await Promise.all(requests);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === "published")).toBe(true);
    const detail = await getApiNormDetail(results[0].slug!);
    expect(detail?.articles).toHaveLength(7);
    expect(detail?.articles[0].contentBlocks).toBeTruthy();
    expect((await searchPersisted({ q: "ficticios" })).some((hit) => hit.norm.slug === detail?.slug)).toBe(true);
    const charges = await getDb().select().from(auditLogs).where(eq(auditLogs.entityId, f.user)); expect(charges).toHaveLength(1);
    expect((await readIngestionState(f.connector, f.reference)).status).toBe("published"); expect(f.fetch).toHaveBeenCalledTimes(1);
    const decisions = await getDb().select().from(editorialDecisions).where(and(eq(editorialDecisions.versionId, detail!.currentVersion!.id), eq(editorialDecisions.action, "auto_publish_validated")));
    expect(decisions).toHaveLength(1); expect(decisions[0].actorId).toBeNull();
  }, 60000);
  it("coordinates 100 requests across two Node processes with one upstream acquisition", async () => {
    const f = await fixture();
    const exec = promisify(execFile);
    const results = await Promise.all([0, 1].map(() => exec(process.execPath, ["--import", "tsx", "tests/helpers/resolver-process.ts", f.key, f.id, f.dir], { env: process.env, timeout: 60000 })));
    expect(results.flatMap((r) => JSON.parse(r.stdout))).toHaveLength(100);
    expect((await readIngestionState(f.connector, f.reference)).status).toBe("published");
    const captures = await getDb().select().from(sourceObservations).where(and(eq(sourceObservations.sourceKey, f.key), eq(sourceObservations.outcome, "captured")));
    expect(captures).toHaveLength(1);
  }, 60000);
  it("ingests and indexes a large document through the actual pipeline without a whole-document vector", async () => {
    const f = await fixture();
    const parts = Array.from({ length: 1000 }, (_, i) => `<EstructuraFuncional idParte="${i + 1}" tipoParte="Artículo"><Texto>${i === 999 ? "singularidad " : "regla "}${i === 998 ? "contenido ".repeat(5000) : i}</Texto><Metadatos><NombreParte>${i + 1}</NombreParte></Metadatos></EstructuraFuncional>`).join("");
    f.setRaw(`<Norma normaId="${f.id}" fechaVersion="2024-01-01"><Identificador fechaPublicacion="2020-01-01"><TiposNumeros><TipoNumero><Tipo>Ley</Tipo><Numero>123</Numero></TipoNumero></TiposNumeros></Identificador><Metadatos><Titulo>Documento sintético grande</Titulo></Metadatos><EstructurasFuncionales>${parts}</EstructurasFuncionales></Norma>`);
    const result = await requestIngestion(f.connector, f.reference, { kind: "account", account: { id: f.user } });
    expect(result.status).toBe("published");
    const detail = await getApiNormDetail(result.slug!); expect(detail?.articles).toHaveLength(1000);
    expect(detail?.articles[998].text.length).toBeGreaterThan(16000);
    expect((await searchPersisted({ q: "singularidad" })).find((r) => r.norm.slug === result.slug)?.node?.stableKey).toBe(`bcn-${f.id}-parte-1000`);
  }, 60000);
  it("keeps the old publication during incomplete updates and handles 304 idempotently", async () => {
    const f = await fixture();
    let at = new Date();
    const resolve = createSourceResolver({ connector: f.connector, storage: f.storage, now: () => at, ttlMs: 1, minIntervalMs: 0 });
    const first = await resolve(f.reference); expect(first.status).toBe("published");
    at = new Date(at.getTime() + 1000);
    f.fetch.mockResolvedValueOnce({ kind: "not-modified", capturedAt: at.toISOString(), url: "https://example.test/synthetic" } as never);
    expect(await resolve(f.reference)).toMatchObject({ status: "published", cache: "revalidated", versionId: first.versionId });
    at = new Date(at.getTime() + 1000);
    f.setRaw(f.raw.replace("Vistos: antecedentes exclusivamente ficticios.", "<img/>"));
    expect(await resolve(f.reference)).toMatchObject({ status: "published", cache: "stale", versionId: first.versionId });
    expect((await getApiNormDetail(first.slug!))?.currentVersion?.id).toBe(first.versionId);
  });
  it("policy revocation during HTTP prevents automatic promotion without losing private evidence", async () => {
    const f = await fixture();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((done) => { release = done; }), started = new Promise<void>((done) => { entered = done; });
    f.fetch.mockImplementationOnce(async () => { entered(); await gate; return { kind: "modified", raw: f.raw, capturedAt: new Date().toISOString(), url: "https://example.test/synthetic" }; });
    const task = requestIngestion(f.connector, f.reference, { kind: "account", account: { id: f.user } });
    await started;
    await getDb().update(sourcePolicies).set({ publicationAllowed: false }).where(eq(sourcePolicies.sourceKey, f.key));
    release(); const result = await task;
    expect(result.status).toBe("pending_review"); expect(result.slug).toBeUndefined();
    const [identity] = await getDb().select().from(documentIdentifiers).where(eq(documentIdentifiers.sourceKey, f.key));
    const versions = await getDb().select().from(normVersions).where(eq(normVersions.normId, identity.normId));
    expect(versions.every((v) => !v.isCurrent && v.publicationStatus === "pending_review")).toBe(true);
  });
  it("manual review uses the same publication core and cannot resurrect a rejection", async () => {
    const f = await fixture("manual_review");
    const resolve = createSourceResolver({ connector: f.connector, storage: f.storage, minIntervalMs: 0 });
    const result = await resolve(f.reference); expect(result.status).toBe("pending_review");
    await approveImportBatch(result.proposal!.id, "reviewer");
    const published = await publishImportBatch(result.proposal!.id, "admin");
    expect((await getDb().select().from(normVersions).where(eq(normVersions.id, published.versionId)))[0].isCurrent).toBe(true);
    const second = await fixture("manual_review");
    const pending = await requestIngestion(second.connector, second.reference, { kind: "account", account: { id: second.user } });
    await rejectImportBatch(pending.proposal!.id, "reviewer", "Rejected synthetic content");
    await getDb().update(sourcePolicies).set({ publicationMode: "auto_publish_validated" }).where(eq(sourcePolicies.sourceKey, second.key));
    expect((await requestIngestion(second.connector, second.reference, { kind: "account", account: { id: second.user } })).status).toBe("pending_review");
    expect((await getDb().select().from(importBatches).where(eq(importBatches.id, pending.proposal!.id)))[0].status).toBe("rejected");
  });
  it("rolls back the version, batch and index together if the publication transaction fails", async () => {
    const f = await fixture("manual_review");
    const pending = await requestIngestion(f.connector, f.reference, { kind: "account", account: { id: f.user } });
    await approveImportBatch(pending.proposal!.id, "reviewer");
    const verified = await verifyPublicationOriginal(pending.proposal!.id);
    await expect(getDb().transaction(async (tx) => {
      await publishPreparedBatch(tx, pending.proposal!.id, { kind: "human", actorId: "admin" }, verified);
      throw new Error("synthetic final failure");
    })).rejects.toThrow("synthetic final failure");
    const [batch] = await getDb().select().from(importBatches).where(eq(importBatches.id, pending.proposal!.id));
    const [version] = await getDb().select().from(normVersions).where(eq(normVersions.id, batch.proposedVersionId!));
    expect(batch.status).toBe("approved"); expect(version.isCurrent).toBe(false); expect(version.publicationStatus).toBe("approved");
    const [identity] = await getDb().select().from(norms).where(eq(norms.id, batch.normId!));
    expect(await getApiNormDetail(identity.slug)).toBeUndefined();
    expect((await searchPersisted({ q: "ficticios" })).some((result) => result.norm.slug === identity.slug)).toBe(false);
  });
  it("does not automatically publish the future date declared in the real-code pattern", async () => {
    const f = await fixture(); f.setRaw(f.raw.replace('fechaVersion="2024-03-15"', 'fechaVersion="2222-02-02"'));
    const pending = await requestIngestion(f.connector, f.reference, { kind: "account", account: { id: f.user } });
    expect(pending.status).toBe("pending_review"); expect(pending.slug).toBeUndefined();
  });
  it("enforces a daily quota independently of the minute window", async () => {
    const f = await fixture(); vi.stubEnv("LEGISDATA_INGESTION_DAILY_LIMIT", "3");
    const base = Date.parse("2026-10-03T12:00:00Z");
    for (let i = 0; i < 3; i++) await getDb().transaction((tx) => consumeIngestionQuota(tx, f.user, new Date(base + i * 70000)));
    await expect(getDb().transaction((tx) => consumeIngestionQuota(tx, f.user, new Date(base + 210000)))).rejects.toMatchObject({ retryAfterSeconds: 42990 });
    await expect(getDb().transaction((tx) => consumeIngestionQuota(tx, f.user, new Date("2026-10-04T00:00:00Z")))).resolves.toBeUndefined();
  });
  it("does not acquire for anonymous, denied entitlement or blocked policy", async () => {
    const f = await fixture();
    await expect(requestIngestion(f.connector, f.reference, { kind: "account", account: null })).rejects.toThrow("AUTHENTICATION_REQUIRED");
    await expect(requestIngestion(f.connector, f.reference, { kind: "account", account: { id: f.user } }, { entitlement: () => false })).rejects.toThrow("INGESTION_FORBIDDEN");
    await getDb().update(sourcePolicies).set({ publicationAllowed: false }).where(eq(sourcePolicies.sourceKey, f.key));
    expect((await requestIngestion(f.connector, f.reference, { kind: "account", account: { id: f.user } })).status).toBe("blocked"); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("retains incompatible well formed evidence privately, without a proposed/public version", async () => {
    const f = await fixture(); f.setRaw(f.raw.replace("Vistos: antecedentes exclusivamente ficticios.", '<img alt="fórmula"/>'));
    expect((await requestIngestion(f.connector, f.reference, { kind: "account", account: { id: f.user } })).status).toBe("unavailable");
    const [source] = await getDb().select().from(sourceDocuments).where(eq(sourceDocuments.sourceKey, f.key));
    expect(await f.storage.get(source.storageKey!)).toBeTruthy();
    const [batch] = await getDb().select().from(importBatches).where(eq(importBatches.sourceDocumentId, source.id));
    expect(batch.status).toBe("validation_failed"); expect(batch.proposedVersionId).toBeNull();
    expect(await getDb().select().from(normNodes).where(eq(normNodes.versionId, batch.proposedVersionId ?? randomUUID()))).toHaveLength(0);
  });
  it("enforces PostgreSQL quotas across parallel transactions including UTC rollover", async () => {
    const f = await fixture(); vi.stubEnv("LEGISDATA_INGESTION_MINUTE_LIMIT", "2");
    const at = new Date("2026-10-03T23:59:59Z");
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => getDb().transaction((tx) => consumeIngestionQuota(tx, f.user, at))));
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    await expect(getDb().transaction((tx) => consumeIngestionQuota(tx, f.user, new Date("2026-10-04T00:00:01Z")))).rejects.toThrow("INGESTION_QUOTA_EXCEEDED");
  });
});
