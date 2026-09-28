import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publicVersionCondition } from "@/db/public-visibility";
import { documentIdentifiers, norms, normVersions, sourceCache, sourceObservations } from "@/db/schema";
import { candidateSchema, type DiscoveryResult, type LegalDiscoveryConnector, type SearchCandidate } from "./discovery-types";
import { parseDiscoveryQuery } from "./discovery-query";
import { createBcnDiscovery, BCN_SPARQL_ENDPOINT } from "./bcn-discovery";
import { acquireLease, backoff, ownsLease, releaseLease, type SourceTransaction } from "./leases";
import { observeCache } from "./metrics";

const hour = 3_600_000;
export function createDiscoveryService(options: { connector: LegalDiscoveryConnector; now?: () => Date; enabled?: () => boolean; minIntervalMs?: number }) {
  const now = options.now ?? (() => new Date());
  return async (input: string): Promise<DiscoveryResult> => {
    const query = parseDiscoveryQuery(input);
    if (!(options.enabled ?? (() => process.env.BCN_DISCOVERY_ENABLED === "true"))()) return { status: "unavailable", candidates: [], cache: "none", reason: "disabled" };
    const { connector } = options;
    const hash = createHash("sha256").update(JSON.stringify(query)).digest("hex");
    const key = `${connector.key}:${query.operation}:${connector.version}:${hash}`;
    const ttl = query.operation === "metadata" ? 24 * hour : hour;
    const staleWindow = query.operation === "metadata" ? 7 * 24 * hour : 24 * hour;
    const prepared = await getDb().transaction(async (tx) => {
      const [entry] = await tx.select().from(sourceCache).where(eq(sourceCache.key, key));
      const parsed = candidateSchema.array().max(10).safeParse(entry?.payload);
      const candidates = parsed.success ? parsed.data : [];
      const eligible = entry && parsed.success && entry.checkedAt.getTime() + staleWindow > now().getTime();
      const cached: DiscoveryResult = { status: candidates.length ? "available" : "empty", candidates, cache: candidates.length ? "hit" : "negative", checkedAt: entry?.checkedAt.toISOString() };
      if (entry && parsed.success && entry.expiresAt > now()) {
        await tx.update(sourceCache).set({ lastAccessedAt: now() }).where(eq(sourceCache.key, key));
        await observeCache(tx, connector.key, key, query.operation, cached.cache, now());
        return { result: cached };
      }
      const reservation = await acquireLease(tx, key, connector.key, now(), options.minIntervalMs ?? 1000);
      if (!("lease" in reservation)) {
        if (eligible && candidates.length) await observeCache(tx, connector.key, key, query.operation, "stale", now());
        return { result: eligible && candidates.length
        ? { ...cached, cache: "stale" as const, retryAfterSeconds: reservation.retryAfterSeconds }
        : { status: reservation.reason === "in_progress" ? "in_progress" as const : "unavailable" as const, candidates: [], cache: "none" as const, retryAfterSeconds: reservation.retryAfterSeconds, reason: reservation.reason } };
      }
      const [latest] = await tx.select().from(sourceCache).where(eq(sourceCache.key, key));
      const latestPayload = candidateSchema.array().max(10).safeParse(latest?.payload);
      if (latest && latestPayload.success && latest.expiresAt > now()) {
        await releaseLease(tx, reservation.lease);
        const result: DiscoveryResult = { status: latestPayload.data.length ? "available" : "empty", candidates: latestPayload.data, cache: latestPayload.data.length ? "hit" : "negative", checkedAt: latest.checkedAt.toISOString() };
        await observeCache(tx, connector.key, key, query.operation, result.cache, now());
        return { result };
      }
      await observeCache(tx, connector.key, key, query.operation, "miss", now());
      return { lease: reservation.lease, stale: eligible && candidates.length ? cached : undefined };
    });
    let result: DiscoveryResult;
    if (prepared.result) result = prepared.result;
    else {
      const { lease } = prepared;
      const started = performance.now();
      let response: Awaited<ReturnType<LegalDiscoveryConnector["discover"]>> | undefined;
      let failure: { kind?: string; httpStatus?: number; retryAfterMs?: number } | undefined;
      try { response = await connector.discover(query); response.candidates = candidateSchema.array().max(10).parse(response.candidates); }
      catch (error) { failure = error && typeof error === "object" ? error : { kind: "upstream" }; }
      try {
        result = await getDb().transaction(async (tx): Promise<DiscoveryResult> => {
          if (!await ownsLease(tx, lease, now())) {
            await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, operation: query.operation, outcome: "discarded_response", observedAt: now(), durationMs: Math.round(performance.now() - started), httpStatus: response ? 200 : failure?.httpStatus });
            return { status: "in_progress", candidates: [], cache: "none", retryAfterSeconds: 2, reason: "lease_expired" };
          }
          await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, operation: query.operation, outcome: failure ? failure.kind ?? "upstream" : response!.candidates.length ? "available" : "empty", observedAt: now(), httpStatus: failure?.httpStatus ?? (failure ? null : 200), sourceUrl: BCN_SPARQL_ENDPOINT, durationMs: Math.round(performance.now() - started), metadata: response ? { count: response.candidates.length, discarded: response.discarded } : undefined });
          if (failure) {
            if (prepared.stale) await observeCache(tx, connector.key, key, query.operation, "stale", now());
            const until = await backoff(tx, connector.key, now(), failure.retryAfterMs ?? 30_000);
            const retryAfterSeconds = Math.ceil((until.getTime() - now().getTime()) / 1000);
            return prepared.stale ? { ...prepared.stale, cache: "stale", retryAfterSeconds, reason: failure.kind ?? "upstream" } : { status: "unavailable", candidates: [], cache: "none", retryAfterSeconds, reason: failure.kind ?? "upstream" };
          }
          const candidates = response!.candidates;
          const values = { sourceKey: connector.key, referenceKind: "query_hash", referenceValue: hash, operation: query.operation, payload: candidates, outcome: candidates.length ? "available" : "empty", checkedAt: now(), expiresAt: new Date(now().getTime() + (candidates.length ? ttl : 300_000)), lastAccessedAt: now() };
          await tx.insert(sourceCache).values({ key, ...values }).onConflictDoUpdate({ target: sourceCache.key, set: values });
          return { status: candidates.length ? "available" : "empty", candidates, cache: "fetched", checkedAt: now().toISOString() };
        });
      } finally { await getDb().transaction((tx) => releaseLease(tx, lease)); }
    }
    return getDb().transaction(async (tx) => {
      const candidates = await withLocalLinks(tx, result.candidates);
      const [event] = await tx.insert(sourceObservations).values({ sourceKey: connector.key, cacheKey: key, operation: query.operation, eventKind: "discovery_served", outcome: result.status, observedAt: now(), metadata: { candidateIds: candidates.flatMap((candidate) => candidate.externalId ? [candidate.externalId] : []), count: candidates.length } }).returning({ id: sourceObservations.id });
      return { ...result, candidates, eventId: event.id };
    });
  };
}

async function withLocalLinks(tx: SourceTransaction, candidates: SearchCandidate[]) {
  const ids = candidates.flatMap((candidate) => candidate.externalId ? [candidate.externalId] : []);
  if (!ids.length) return candidates;
  const published = await tx.select({ externalId: documentIdentifiers.externalId, source: documentIdentifiers.sourceKey, slug: norms.slug, versionId: normVersions.id }).from(documentIdentifiers).innerJoin(norms, eq(norms.id, documentIdentifiers.normId)).innerJoin(normVersions, eq(normVersions.normId, norms.id)).where(and(inArray(documentIdentifiers.externalId, ids), eq(normVersions.isCurrent, true), publicVersionCondition()));
  return candidates.map((candidate) => {
    const local = published.find((row) => row.source === candidate.source && row.externalId === candidate.externalId);
    return local ? { ...candidate, local: { slug: local.slug, versionId: local.versionId, needsRevalidation: true } } : candidate;
  });
}

export const discoverBcn = createDiscoveryService({ connector: createBcnDiscovery() });
