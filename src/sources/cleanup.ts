import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sourceCache, sourceLeases, sourceObservations } from "@/db/schema";

/** Operational housekeeping only; never touches captures, editorial evidence or personal references. */
export async function cleanSourceTemporaries(at = new Date()) {
  return getDb().transaction(async (tx) => {
    const metrics = await tx.delete(sourceObservations).where(and(lt(sourceObservations.observedAt, new Date(at.getTime() - 30 * 86_400_000)), isNull(sourceObservations.sourceDocumentId), or(ne(sourceObservations.eventKind, "upstream"), ne(sourceObservations.operation, "resolve")))).returning({ id: sourceObservations.id });
    const cache = await tx.delete(sourceCache).where(and(isNull(sourceCache.sourceDocumentId), or(and(eq(sourceCache.operation, "discover"), lt(sourceCache.checkedAt, new Date(at.getTime() - 86_400_000))), and(eq(sourceCache.operation, "metadata"), lt(sourceCache.checkedAt, new Date(at.getTime() - 7 * 86_400_000))), and(eq(sourceCache.operation, "resolve"), eq(sourceCache.outcome, "not_found"), lt(sourceCache.expiresAt, at))))).returning({ key: sourceCache.key });
    const leases = await tx.delete(sourceLeases).where(lt(sourceLeases.expiresAt, at)).returning({ key: sourceLeases.key });
    return { metrics: metrics.length, cache: cache.length, leases: leases.length };
  });
}
