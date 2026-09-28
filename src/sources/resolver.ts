import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publicVersionCondition } from "@/db/public-visibility";
import { documentIdentifiers, editorialDecisions, importBatches, normNodes, normVersions, norms, sourceCache, sourceDocuments, sourceObservations, sourcePolicies } from "@/db/schema";
import { FilesystemRawStorage } from "@/ingestion/storage/filesystem";
import type { RawStorage } from "@/ingestion/storage/types";
import { sourcePublicationAllowed } from "@/ingestion/editorial/source-policy";
import type { LegalSourceConnector, SourceDocument, SourceReference, SourceFetch } from "./types";
import { acquireLease, ownsLease, releaseLease, backoff } from "./leases";
import { observeCache } from "./metrics";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type CacheEntry = typeof sourceCache.$inferSelect;
export type Resolution = {
  status: "published" | "pending_review" | "not_found" | "unavailable" | "resolving";
  cache: "hit" | "fetched" | "revalidated" | "stale" | "negative" | "none";
  source: string;
  reference: SourceReference;
  checkedAt: string | null;
  sourceUrl?: string;
  slug?: string;
  versionId?: string;
  retryAfterSeconds?: number;
  reason?: string;
  proposal?: { id: string; title?: string; number?: string; type?: string; publicationDate?: string; organisms?: string[]; requestable: boolean };
};
type ResolverOptions = {
  connector: LegalSourceConnector;
  storage?: RawStorage;
  now?: () => Date;
  ttlMs?: number;
  negativeTtlMs?: number;
  minIntervalMs?: number;
};
const pending = new Map<string, Promise<Resolution>>();
const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/** Shared by web, API and CLI. No unreviewed document text leaves this service. */
export function createSourceResolver(options: ResolverOptions) {
  const { connector } = options;
  const now = options.now ?? (() => new Date());
  const storage = options.storage ?? new FilesystemRawStorage();
  const ttlMs = options.ttlMs ?? 6 * 60 * 60_000;
  const negativeTtlMs = options.negativeTtlMs ?? 60_000;
  return async (reference: SourceReference): Promise<Resolution> => {
    if (!/^[1-9]\d{0,11}$/.test(reference.value) || !["idNorma", "idLey"].includes(reference.kind)) throw new Error("INVALID_SOURCE_REFERENCE");
    const key = resolutionKey(connector, reference);
    const inFlightKey = `${process.env.DATABASE_URL}:${key}`;
    if (pending.has(inFlightKey)) return pending.get(inFlightKey)!;
    const task = run();
    pending.set(inFlightKey, task);
    try { return await task; } finally { pending.delete(inFlightKey); }

    async function run(): Promise<Resolution> {
      const prepared = await getDb().transaction(async (tx) => {
        const [cached] = await tx.select().from(sourceCache).where(eq(sourceCache.key, key));
        const at = now();
        if (cached && cached.expiresAt > at) {
          await tx.update(sourceCache).set({ lastAccessedAt: at }).where(eq(sourceCache.key, key));
          const cache = cached.outcome === "not_found" ? "negative" : "hit";
          await observeCache(tx, connector.key, key, "resolve", cache, at);
          return { result: await publicResolution(tx, cached, reference, cache) };
        }
        if (cached?.retryAfter && cached.retryAfter > at) {
          await observeCache(tx, connector.key, key, "resolve", "stale", at);
          return { result: await publicResolution(tx, cached, reference, "stale", seconds(cached.retryAfter.getTime() - at.getTime())) };
        }
        const reservation = await acquireLease(tx, key, connector.key, at, options.minIntervalMs ?? 1_000);
        if (!("lease" in reservation)) {
          if (cached) await observeCache(tx, connector.key, key, "resolve", "stale", at);
          return { result: cached?.sourceDocumentId
          ? { ...await publicResolution(tx, cached, reference, "stale", reservation.retryAfterSeconds), reason: reservation.reason }
          : { status: reservation.reason === "in_progress" ? "resolving" : "unavailable", cache: "none", source: connector.key, reference, checkedAt: null, retryAfterSeconds: reservation.retryAfterSeconds, reason: reservation.reason } as Resolution };
        }
        const [latest] = await tx.select().from(sourceCache).where(eq(sourceCache.key, key));
        if (latest && latest.expiresAt > now()) {
          await releaseLease(tx, reservation.lease);
          const cache = latest.outcome === "not_found" ? "negative" : "hit";
          await observeCache(tx, connector.key, key, "resolve", cache, now());
          return { result: await publicResolution(tx, latest, reference, cache) };
        }
        await observeCache(tx, connector.key, key, "resolve", "miss", at);
        return { cached, lease: reservation.lease };
      });
      if (prepared.result) return prepared.result;
      const { cached, lease } = prepared;
      const started = performance.now();
      let response: SourceFetch | undefined;
      let document: SourceDocument | undefined;
      let checksum: string | undefined;
      let objectKey: string | undefined;
      let failure: { kind: string; httpStatus?: number; retryAfterMs?: number } | undefined;
      let durationMs: number | undefined;
      // Network, parsing, and durable filesystem IO are deliberately outside every DB transaction.
      try {
        response = await connector.fetch(reference, { etag: cached?.etag, lastModified: cached?.lastModified });
        durationMs = Math.round(performance.now() - started);
        if (response.kind === "modified") {
          try {
            checksum = createHash("sha256").update(response.raw ?? "").digest("hex");
            if (!response.raw || (response.checksum && response.checksum !== checksum)) throw new Error("Invalid checksum");
            document = connector.normalize(response.raw, { url: response.url, capturedAt: response.capturedAt, checksum });
            validateDocument(document);
            if (reference.kind === "idNorma" && document.sourceIdentifier !== reference.value) throw new Error("Source identity mismatch");
            if (reference.kind === "idLey" && (document.number.replace(/\./g, "") !== reference.value || document.type.toLowerCase() !== "ley")) throw new Error("Source law identity mismatch");
          } catch { throw { kind: "invalid_document", httpStatus: 200 }; }
          objectKey = `sources/${connector.key}/${document.sourceIdentifier}/${checksum}.xml`;
          await storage.put(objectKey, response.raw!);
        } else if (!cached?.sourceDocumentId) throw { kind: "unexpected_304", httpStatus: 304 };
      } catch (error) {
        const typed = error as { kind?: string; httpStatus?: number; retryAfterMs?: number } | null;
        failure = { kind: typed?.kind ?? "upstream", httpStatus: typed?.httpStatus, retryAfterMs: typed?.retryAfterMs };
      }
      durationMs ??= Math.round(performance.now() - started);
      try {
        return await getDb().transaction(async (tx): Promise<Resolution> => {
          if (!await ownsLease(tx, lease, now())) {
            await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, observedAt: now(), outcome: "discarded_response", durationMs, httpStatus: response ? response.kind === "modified" ? 200 : 304 : failure?.httpStatus });
            return { status: "resolving", cache: "none", source: connector.key, reference, checkedAt: null, retryAfterSeconds: 2, reason: "lease_expired" };
          }
          if (failure) {
            await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, observedAt: now(), outcome: failure.kind, httpStatus: failure.httpStatus, durationMs, checksum });
            if (failure.kind === "not-found" && !cached?.sourceDocumentId) {
              const entry = await writeCache(tx, key, connector.key, reference, { sourceDocumentId: null, etag: null, lastModified: null, outcome: "not_found", checkedAt: now(), expiresAt: new Date(now().getTime() + negativeTtlMs), retryAfter: null, lastAccessedAt: now() });
              return publicResolution(tx, entry, reference, "negative");
            }
            const until = await backoff(tx, connector.key, now(), failure.retryAfterMs ?? 30_000);
            const retry = seconds(until.getTime() - now().getTime());
            if (cached) {
              await observeCache(tx, connector.key, key, "resolve", "stale", now());
              await tx.update(sourceCache).set({ retryAfter: until }).where(eq(sourceCache.key, key));
              return { ...await publicResolution(tx, cached, reference, "stale", retry), reason: failure.kind };
            }
            return { status: "unavailable", cache: "none", source: connector.key, reference, checkedAt: null, retryAfterSeconds: retry, reason: failure.kind };
          }
          if (response!.kind === "not-modified") {
            const entry = await writeCache(tx, key, connector.key, reference, { ...cached!, etag: response!.etag ?? cached!.etag, lastModified: response!.lastModified ?? cached!.lastModified, checkedAt: now(), expiresAt: new Date(now().getTime() + ttlMs), retryAfter: null, lastAccessedAt: now() });
            await tx.update(sourceCache).set({ etag: entry.etag, lastModified: entry.lastModified, checkedAt: entry.checkedAt, expiresAt: entry.expiresAt, retryAfter: null }).where(and(eq(sourceCache.sourceKey, connector.key), eq(sourceCache.sourceDocumentId, entry.sourceDocumentId!)));
            await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, sourceDocumentId: entry.sourceDocumentId, observedAt: now(), outcome: "not_modified", httpStatus: 304, durationMs, sourceUrl: response!.url });
            return publicResolution(tx, entry, reference, "revalidated");
          }
          const normalized = document!;
          let [source] = await tx.select().from(sourceDocuments).where(and(eq(sourceDocuments.sourceKey, connector.key), eq(sourceDocuments.sourceIdentifier, normalized.sourceIdentifier), eq(sourceDocuments.checksum, checksum!), eq(sourceDocuments.parserVersion, connector.parserVersion)));
          const [identity] = await tx.select().from(documentIdentifiers).where(and(eq(documentIdentifiers.sourceKey, connector.key), eq(documentIdentifiers.externalId, normalized.sourceIdentifier)));
          const change = source ? "unchanged" : identity ? "modified_representation" : "new_document";
          if (!source) [source] = await tx.insert(sourceDocuments).values({ sourceKey: connector.key, sourceName: connector.name, sourceIdentifier: normalized.sourceIdentifier, sourceUrl: response!.url, format: "application/xml", checksum: checksum!, parser: connector.parserVersion, parserVersion: connector.parserVersion, storageKey: objectKey!, originalObjectKey: objectKey!, capturedAt: new Date(response!.capturedAt), capturedHttpStatus: 200, normalizedContent: normalized, issuingOrganization: normalized.organisms.join("; ") }).returning();
          await proposeDocument(tx, source.id, connector, normalized, checksum!);
          const values = { sourceDocumentId: source.id, etag: response!.etag ?? null, lastModified: response!.lastModified ?? null, outcome: "captured", checkedAt: now(), expiresAt: new Date(now().getTime() + ttlMs), retryAfter: null, lastAccessedAt: now() };
          const entry = await writeCache(tx, key, connector.key, reference, values);
          // Proof from the normalized document permits aliases without an extra HTTP fetch.
          const aliases: SourceReference[] = [{ kind: "idNorma", value: normalized.sourceIdentifier }];
          const lawNumber = normalized.number.replace(/\./g, "");
          if (normalized.type.toLowerCase() === "ley" && /^[1-9]\d{0,11}$/.test(lawNumber)) aliases.push({ kind: "idLey", value: lawNumber });
          for (const alias of aliases) if (resolutionKey(connector, alias) !== key) await writeCache(tx, resolutionKey(connector, alias), connector.key, alias, values);
          await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, sourceDocumentId: source.id, observedAt: now(), outcome: "captured", httpStatus: 200, sourceUrl: response!.url, checksum, durationMs, metadata: { change } });
          return publicResolution(tx, entry, reference, "fetched");
        });
      } finally {
        await getDb().transaction((tx) => releaseLease(tx, lease));
      }
    }
  };
}

export function resolutionKey(connector: Pick<LegalSourceConnector, "key" | "parserVersion">, reference: SourceReference) {
  return `${connector.key}:${reference.kind}:${reference.value}:latest:xml:${connector.parserVersion}`;
}

export async function readSourceResolution(connector: LegalSourceConnector, reference: SourceReference) {
  return getDb().transaction(async (tx) => {
    const [entry] = await tx.select().from(sourceCache).where(eq(sourceCache.key, resolutionKey(connector, reference)));
    if (!entry) return undefined;
    return { resolution: await publicResolution(tx, entry, reference, entry.expiresAt > new Date() ? entry.outcome === "not_found" ? "negative" : "hit" : "stale"), fresh: entry.expiresAt > new Date() };
  });
}
async function writeCache(tx: Transaction, key: string, sourceKey: string, reference: SourceReference, values: Omit<CacheEntry, "key" | "sourceKey" | "referenceKind" | "referenceValue" | "operation" | "payload">) {
  const [entry] = await tx.insert(sourceCache).values({ ...values, key, sourceKey, referenceKind: reference.kind, referenceValue: reference.value })
    .onConflictDoUpdate({ target: sourceCache.key, set: values }).returning();
  return entry;
}

async function publicResolution(tx: Transaction, cached: CacheEntry, reference: SourceReference, cache: Resolution["cache"], retryAfterSeconds?: number): Promise<Resolution> {
  const base = { cache, source: cached.sourceKey, reference, checkedAt: cached.checkedAt.toISOString(), retryAfterSeconds };
  // An expired negative entry cannot prove absence when the new request fails.
  if (!cached.sourceDocumentId) return { ...base, status: cached.outcome === "not_found" && cache === "negative" ? "not_found" : "unavailable" };
  const [source] = await tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, cached.sourceDocumentId));
  if (!source?.sourceIdentifier) return { ...base, status: "unavailable" };
  const sourceUrl = cached.sourceKey === "bcn-leychile"
    ? `https://www.bcn.cl/leychile/navegar?idNorma=${encodeURIComponent(source.sourceIdentifier)}`
    : source.sourceUrl ?? undefined;
  const [policy] = await tx.select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, cached.sourceKey));
  const [batch] = await tx.select().from(importBatches).where(eq(importBatches.sourceDocumentId, source.id));
  const doc = source.normalizedContent;
  const proposal = batch ? { id: batch.id, title: doc?.title, number: doc?.number, type: doc?.type, publicationDate: doc?.publishedAt ?? undefined, organisms: doc?.organisms, requestable: ["pending_review", "approved"].includes(batch.status) } : undefined;
  if (!sourcePublicationAllowed(source, policy)) return { ...base, status: "pending_review", sourceUrl, proposal };
  const [identity] = await tx.select().from(documentIdentifiers).where(and(eq(documentIdentifiers.sourceKey, cached.sourceKey), eq(documentIdentifiers.externalId, source.sourceIdentifier)));
  if (!identity) return { ...base, status: "pending_review", sourceUrl, proposal };
  const [published] = await tx.select({ slug: norms.slug, id: normVersions.id, sourceDocumentId: normVersions.sourceDocumentId })
    .from(normVersions).innerJoin(norms, eq(norms.id, normVersions.normId))
    .where(and(eq(normVersions.normId, identity.normId), publicVersionCondition(), eq(normVersions.isCurrent, true)))
    .orderBy(desc(normVersions.publishedAt)).limit(1);
  if (!published) return { ...base, status: "pending_review", sourceUrl, proposal };
  return { ...base, status: "published", sourceUrl, slug: published.slug, versionId: published.id,
    ...(published.sourceDocumentId !== cached.sourceDocumentId ? { cache: "stale" as const, reason: "update_pending_review" } : {}) };
}

async function proposeDocument(tx: Transaction, sourceDocumentId: string, connector: LegalSourceConnector, document: SourceDocument, checksum: string) {
  const [existing] = await tx.select().from(importBatches).where(and(eq(importBatches.sourceDocumentId, sourceDocumentId), eq(importBatches.parserVersion, connector.parserVersion)));
  if (existing) return;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`identity:${connector.key}:${document.sourceIdentifier}`}, 0))`);
  let [identity] = await tx.select().from(documentIdentifiers).where(and(eq(documentIdentifiers.sourceKey, connector.key), eq(documentIdentifiers.externalId, document.sourceIdentifier)));
  if (!identity) {
    const prefix = connector.key === "bcn-leychile" ? "bcn" : connector.key;
    const [norm] = await tx.insert(norms).values({ slug: `${prefix}-${document.sourceIdentifier}`, type: document.type, number: document.number, title: document.title,
      shortTitle: `${document.type} ${document.number}`, description: `Texto recuperado de ${connector.name}.`, status: document.status,
      topics: [], publishedAt: new Date(document.publishedAt!), updatedAt: new Date(document.versionDate ?? document.publishedAt!),
    }).returning();
    [identity] = await tx.insert(documentIdentifiers).values({ sourceKey: connector.key, externalId: document.sourceIdentifier, normId: norm.id }).returning();
  }
  const [version] = await tx.insert(normVersions).values({ normId: identity.normId,
    versionLabel: `${document.versionDate ?? "fecha-no-informada"}:${checksum.slice(0, 16)}:${connector.parserVersion}`,
    validFrom: null, sourceVersionDate: document.versionDate ? new Date(document.versionDate) : null,
    isCurrent: false, kind: "proposed", publicationStatus: "pending_review", sourceDocumentId,
  }).returning();
  const inserted = await tx.insert(normNodes).values(document.nodes.map((node) => ({ versionId: version.id, stableKey: node.stableKey, type: node.type, label: node.label, title: node.title, text: node.text, position: node.position }))).returning();
  const ids = new Map(inserted.map((node) => [node.stableKey, node.id]));
  for (const node of document.nodes) {
    if (node.parentStableKey) await tx.update(normNodes).set({ parentId: ids.get(node.parentStableKey)! }).where(eq(normNodes.id, ids.get(node.stableKey)!));
  }
  const [batch] = await tx.insert(importBatches).values({ checksum, status: "pending_review", sourceDocumentId, normId: identity.normId,
    proposedVersionId: version.id, parserVersion: connector.parserVersion, itemCount: document.nodes.length,
  }).returning();
  await tx.insert(editorialDecisions).values({ batchId: batch.id, normId: identity.normId, versionId: version.id,
    action: "submit_review", previousStatus: "captured", newStatus: "pending_review", reason: "Documento recuperado bajo demanda; requiere revisión editorial y política de uso verificada.", metadata: { warnings: document.warnings },
  });
}

function validateDocument(document: SourceDocument) {
  if (!/^[1-9]\d{0,11}$/.test(document.sourceIdentifier) || !document.type || !document.number || !document.title || !document.nodes.length) throw new Error("Incomplete source document.");
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value));
  if (!document.publishedAt || !validDate(document.publishedAt) || (document.versionDate && !validDate(document.versionDate))) throw new Error("Publication metadata missing or invalid.");
  const keys = new Set(document.nodes.map((node) => node.stableKey));
  if (keys.size !== document.nodes.length) throw new Error("Duplicate nodes.");
  for (const node of document.nodes) if (node.parentStableKey && (!keys.has(node.parentStableKey) || node.parentStableKey === node.stableKey)) throw new Error("Invalid hierarchy.");
}
