import { and, eq, gte, sql } from "drizzle-orm";
import { auditLogs } from "@/db/schema";
import type { SourceTransaction } from "./leases";

export class IngestionQuotaError extends Error {
  constructor(public retryAfterSeconds: number) { super("INGESTION_QUOTA_EXCEEDED"); }
}
function limit(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error("INVALID_INGESTION_LIMIT");
  return Number(value);
}
/** Called only by a lease owner, inside the same short transaction. Rollback returns the lease/budget too. */
export async function consumeIngestionQuota(tx: SourceTransaction, userId: string, at: Date) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ingestion-user:${userId}`}, 0))`);
  const midnight = new Date(at); midnight.setUTCHours(0, 0, 0, 0);
  const minute = new Date(at.getTime() - 60_000);
  const rows = await tx.select({ at: auditLogs.createdAt }).from(auditLogs).where(and(
    eq(auditLogs.entityType, "ingestion_account"), eq(auditLogs.entityId, userId),
    eq(auditLogs.action, "acquisition_started"), gte(auditLogs.createdAt, new Date(Math.min(midnight.getTime(), minute.getTime()))),
  ));
  if (rows.filter((r) => r.at >= midnight).length >= limit(process.env.LEGISDATA_INGESTION_DAILY_LIMIT, 10))
    throw new IngestionQuotaError(Math.ceil((midnight.getTime() + 86_400_000 - at.getTime()) / 1000));
  const recent = rows.filter((r) => r.at > minute).sort((a, b) => a.at.getTime() - b.at.getTime());
  if (recent.length >= limit(process.env.LEGISDATA_INGESTION_MINUTE_LIMIT, 2))
    throw new IngestionQuotaError(Math.max(1, Math.ceil((recent[0].at.getTime() + 60_000 - at.getTime()) / 1000)));
  await tx.insert(auditLogs).values({ actorId: userId, action: "acquisition_started", entityType: "ingestion_account", entityId: userId, result: "started", createdAt: at });
}
