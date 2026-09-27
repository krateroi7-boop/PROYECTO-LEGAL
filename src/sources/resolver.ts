import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publicVersionCondition } from "@/db/public-visibility";
import { documentIdentifiers, editorialDecisions, importBatches, normNodes, normVersions, norms, sourceBudgets, sourceCache, sourceDocuments, sourceObservations, sourcePolicies } from "@/db/schema";
import { FilesystemRawStorage } from "@/ingestion/storage/filesystem";
import type { RawStorage } from "@/ingestion/storage/types";
import { sourcePublicationAllowed } from "@/ingestion/editorial/source-policy";
import type { LegalSourceConnector, SourceDocument, SourceReference } from "./types";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type CacheEntry = typeof sourceCache.$inferSelect;
export type Resolution = {
  status: "published" | "pending_review" | "not_found" | "unavailable";
  cache: "hit" | "fetched" | "revalidated" | "stale" | "negative" | "none";
  source: string;
  reference: SourceReference;
  checkedAt: string | null;
  sourceUrl?: string;
  slug?: string;
  versionId?: string;
  retryAfterSeconds?: number;
  reason?: string;
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
  const connector = options.connector;
  const now = options.now ?? (() => new Date());
  const storage = options.storage ?? new FilesystemRawStorage();
  const ttlMs = options.ttlMs ?? 6 * 60 * 60_000;
  const negativeTtlMs = options.negativeTtlMs ?? 60_000;
  const minIntervalMs = options.minIntervalMs ?? 1_000;

  return async (reference: SourceReference): Promise<Resolution> => {
    if (!/^[1-9]\d{0,11}$/.test(reference.value) || !["idNorma", "idLey"].includes(reference.kind)) {
      throw new Error("INVALID_SOURCE_REFERENCE");
    }
    const key = `${connector.key}:${reference.kind}:${reference.value}:latest:xml:${connector.parserVersion}`;
    // Coalescing is local; the advisory lock below also covers independent app instances.
    const inFlightKey = `${process.env.DATABASE_URL}:${key}`;
    if (pending.has(inFlightKey)) return pending.get(inFlightKey)!;
    const task = getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      const [cached] = await tx.select().from(sourceCache).where(eq(sourceCache.key, key));
      const at = now();
      if (cached) await tx.update(sourceCache).set({ lastAccessedAt: at }).where(eq(sourceCache.key, key));
      if (cached && cached.expiresAt > at) {
        return publicResolution(tx, cached, reference, cached.outcome === "not_found" ? "negative" : "hit");
      }
      if (cached?.retryAfter && cached.retryAfter > at) {
        return publicResolution(tx, cached, reference, "stale", seconds(cached.retryAfter.getTime() - at.getTime()));
      }

      // Serialize upstream work per provider across processes; a cache hit never takes this lock.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`source-budget:${connector.key}`}))`);
      const [budget] = await tx.select().from(sourceBudgets).where(eq(sourceBudgets.sourceKey, connector.key));
      if (budget && budget.nextRequestAt > now()) {
        const delay = budget.nextRequestAt.getTime() - now().getTime();
        if (delay > 1_100) {
          return cached
            ? publicResolution(tx, cached, reference, "stale", seconds(delay))
            : { status: "unavailable", cache: "none", source: connector.key, reference, checkedAt: null, retryAfterSeconds: seconds(delay), reason: "source_backoff" } satisfies Resolution;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      await tx.insert(sourceBudgets).values({ sourceKey: connector.key, nextRequestAt: new Date(now().getTime() + minIntervalMs) })
        .onConflictDoUpdate({ target: sourceBudgets.sourceKey, set: { nextRequestAt: new Date(now().getTime() + minIntervalMs) } });
      let response;
      try {
        response = await connector.fetch(reference, { etag: cached?.etag, lastModified: cached?.lastModified });
      } catch (error) {
        const kind = error && typeof error === "object" && "kind" in error ? String(error.kind) : "upstream";
        const httpStatus = error && typeof error === "object" && "httpStatus" in error ? Number(error.httpStatus) : null;
        const retryValue = error && typeof error === "object" && "retryAfterMs" in error ? Number(error.retryAfterMs) : 0;
        const delay = Math.max(30_000, Math.min(24 * 60 * 60_000, Number.isFinite(retryValue) ? retryValue : 0));
        await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, observedAt: now(), outcome: kind, httpStatus: Number.isFinite(httpStatus) ? httpStatus : null });
        if (kind === "not-found" && !cached?.sourceDocumentId) {
          const entry = await writeCache(tx, key, connector.key, reference, {
            sourceDocumentId: null, etag: null, lastModified: null, outcome: "not_found", checkedAt: now(), expiresAt: new Date(now().getTime() + negativeTtlMs), retryAfter: null, lastAccessedAt: now(),
          });
          return publicResolution(tx, entry, reference, "negative");
        }
        if (kind === "rate-limit" || kind === "upstream" || kind === "timeout") {
          await tx.update(sourceBudgets).set({ nextRequestAt: new Date(now().getTime() + delay) }).where(eq(sourceBudgets.sourceKey, connector.key));
        }
        if (cached) {
          await tx.update(sourceCache).set({ retryAfter: new Date(now().getTime() + delay) }).where(eq(sourceCache.key, key));
          return publicResolution(tx, cached, reference, "stale", seconds(delay));
        }
        return { status: "unavailable", cache: "none", source: connector.key, reference, checkedAt: null, retryAfterSeconds: seconds(delay), reason: kind } satisfies Resolution;
      }

      if (response.kind === "not-modified") {
        if (!cached?.sourceDocumentId) return { status: "unavailable", cache: "none", source: connector.key, reference, checkedAt: null, reason: "unexpected_304" } satisfies Resolution;
        const updated = await writeCache(tx, key, connector.key, reference, {
          ...cached, etag: response.etag ?? cached.etag, lastModified: response.lastModified ?? cached.lastModified,
          checkedAt: now(), expiresAt: new Date(now().getTime() + ttlMs), retryAfter: null, lastAccessedAt: now(),
        });
        await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, sourceDocumentId: cached.sourceDocumentId, observedAt: now(), outcome: "not_modified", httpStatus: 304, sourceUrl: response.url, etag: updated.etag, lastModified: updated.lastModified });
        return publicResolution(tx, updated, reference, "revalidated");
      }

      let normalized: SourceDocument;
      const checksum = createHash("sha256").update(response.raw ?? "").digest("hex");
      try {
        if (!response.raw || (response.checksum && response.checksum !== checksum)) throw new Error("Invalid source checksum.");
        normalized = connector.normalize(response.raw, { url: response.url, capturedAt: response.capturedAt, checksum });
        validateDocument(normalized);
        if (reference.kind === "idNorma" && normalized.sourceIdentifier !== reference.value) throw new Error("Source identity mismatch.");
        if (reference.kind === "idLey" && (normalized.number.replace(/\./g, "") !== reference.value || normalized.type.toLowerCase() !== "ley")) throw new Error("Source law identity mismatch.");
      } catch {
        await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, observedAt: now(), outcome: "invalid_document", httpStatus: 200, sourceUrl: response.url, checksum });
        if (cached) {
          await tx.update(sourceCache).set({ retryAfter: new Date(now().getTime() + 60_000) }).where(eq(sourceCache.key, key));
          return publicResolution(tx, cached, reference, "stale", 60);
        }
        return { status: "unavailable", cache: "none", source: connector.key, reference, checkedAt: null, reason: "invalid_document" } satisfies Resolution;
      }
      const objectKey = `sources/${connector.key}/${normalized.sourceIdentifier}/${checksum}.xml`;
      await storage.put(objectKey, response.raw!);
      let [source] = await tx.select().from(sourceDocuments).where(and(
        eq(sourceDocuments.sourceKey, connector.key), eq(sourceDocuments.sourceIdentifier, normalized.sourceIdentifier),
        eq(sourceDocuments.checksum, checksum), eq(sourceDocuments.parserVersion, connector.parserVersion),
      ));
      if (!source) {
        [source] = await tx.insert(sourceDocuments).values({
          sourceKey: connector.key, sourceName: connector.name, sourceIdentifier: normalized.sourceIdentifier,
          sourceUrl: response.url, format: "application/xml", checksum, parser: connector.parserVersion,
          parserVersion: connector.parserVersion, storageKey: objectKey, originalObjectKey: objectKey,
          capturedAt: new Date(response.capturedAt), capturedHttpStatus: 200, normalizedContent: normalized,
          issuingOrganization: normalized.organisms.join("; "),
        }).returning();
      }
      await proposeDocument(tx, source.id, connector, normalized, checksum);
      const entry = await writeCache(tx, key, connector.key, reference, {
        sourceDocumentId: source.id, etag: response.etag ?? null, lastModified: response.lastModified ?? null,
        outcome: "captured", checkedAt: now(), expiresAt: new Date(now().getTime() + ttlMs), retryAfter: null, lastAccessedAt: now(),
      });
      await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, sourceDocumentId: source.id, observedAt: now(), outcome: "captured", httpStatus: 200, sourceUrl: response.url, etag: entry.etag, lastModified: entry.lastModified, checksum });
      return publicResolution(tx, entry, reference, "fetched");
    });
    pending.set(inFlightKey, task);
    try { return await task; } finally { pending.delete(inFlightKey); }
  };
}

async function writeCache(tx: Transaction, key: string, sourceKey: string, reference: SourceReference, values: Omit<CacheEntry, "key" | "sourceKey" | "referenceKind" | "referenceValue">) {
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
  if (!sourcePublicationAllowed(source, policy)) return { ...base, status: "pending_review", sourceUrl };
  const [identity] = await tx.select().from(documentIdentifiers).where(and(eq(documentIdentifiers.sourceKey, cached.sourceKey), eq(documentIdentifiers.externalId, source.sourceIdentifier)));
  if (!identity) return { ...base, status: "pending_review", sourceUrl };
  const [published] = await tx.select({ slug: norms.slug, id: normVersions.id, sourceDocumentId: normVersions.sourceDocumentId })
    .from(normVersions).innerJoin(norms, eq(norms.id, normVersions.normId))
    .where(and(eq(normVersions.normId, identity.normId), publicVersionCondition(), eq(normVersions.isCurrent, true)))
    .orderBy(desc(normVersions.publishedAt)).limit(1);
  if (!published) return { ...base, status: "pending_review", sourceUrl };
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
