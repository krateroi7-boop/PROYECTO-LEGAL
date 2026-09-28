import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { importBatches, sourceDocuments, sourceObservations } from "@/db/schema";
import type { SourceTransaction } from "./leases";

export async function observeCache(tx: SourceTransaction, sourceKey: string, key: string, operation: string, outcome: string, at: Date) {
  await tx.insert(sourceObservations).values({ sourceKey, cacheKey: key, operation, eventKind: "cache", outcome, observedAt: at });
}

export async function recordDiscoverySelection(id: string, externalId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  const db = getDb();
  const [event] = await db.select().from(sourceObservations).where(and(eq(sourceObservations.id, id), eq(sourceObservations.eventKind, "discovery_served"), gt(sourceObservations.observedAt, new Date(Date.now() - 86_400_000))));
  if (!event?.metadata?.candidateIds?.includes(externalId)) return;
  await db.insert(sourceObservations).values({ sourceKey: event.sourceKey, cacheKey: event.cacheKey, operation: "discover", eventKind: "discovery_selected", discoveryEventId: id, outcome: "selected", observedAt: new Date() }).onConflictDoNothing();
}

export async function getSourceMetrics(sourceKey: string) {
  const db = getDb();
  const events = await db.select({ operation: sourceObservations.operation, kind: sourceObservations.eventKind, outcome: sourceObservations.outcome, count: sql<number>`count(*)::int`, averageMs: sql<number | null>`round(avg(${sourceObservations.durationMs}))::int` }).from(sourceObservations).where(and(eq(sourceObservations.sourceKey, sourceKey), gt(sourceObservations.observedAt, new Date(Date.now() - 30 * 86_400_000)))).groupBy(sourceObservations.operation, sourceObservations.eventKind, sourceObservations.outcome);
  const [pending] = await db.select({ count: sql<number>`count(*)::int`, oldest: sql<string | null>`min(${importBatches.startedAt})::text` }).from(importBatches).innerJoin(sourceDocuments, eq(sourceDocuments.id, importBatches.sourceDocumentId)).where(and(eq(sourceDocuments.sourceKey, sourceKey), eq(importBatches.status, "pending_review")));
  const hits = events.filter((e) => e.kind === "cache" && e.outcome === "hit").reduce((n, e) => n + e.count, 0);
  const misses = events.filter((e) => e.kind === "cache" && e.outcome === "miss").reduce((n, e) => n + e.count, 0);
  const served = events.filter((e) => e.kind === "discovery_served" && e.outcome === "available").reduce((n, e) => n + e.count, 0);
  const selected = events.filter((e) => e.kind === "discovery_selected").reduce((n, e) => n + e.count, 0);
  const cacheByOperation = ["resolve", "discover", "metadata"].map((operation) => {
    const count = (outcome: string) => events.filter((e) => e.operation === operation && e.kind === "cache" && e.outcome === outcome).reduce((n, e) => n + e.count, 0);
    const hits = count("hit"), misses = count("miss");
    return { operation, hits, misses, negative: count("negative"), stale: count("stale"), ratio: hits + misses ? hits / (hits + misses) : null };
  });
  const changes = await db.select({ change: sql<string>`${sourceObservations.metadata}->>'change'`, count: sql<number>`count(*)::int` }).from(sourceObservations).where(and(eq(sourceObservations.sourceKey, sourceKey), gt(sourceObservations.observedAt, new Date(Date.now() - 30 * 86_400_000)), sql`${sourceObservations.metadata}->>'change' is not null`)).groupBy(sql`${sourceObservations.metadata}->>'change'`);
  return { events, pending, changes, cacheByOperation, cacheHitRatio: hits + misses ? hits / (hits + misses) : null, discoveryConversion: served ? selected / served : null };
}
