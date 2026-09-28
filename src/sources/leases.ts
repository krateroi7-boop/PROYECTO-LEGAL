import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sourceBudgets, sourceLeases } from "@/db/schema";

export type SourceTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type Lease = { key: string; sourceKey: string; owner: string };
const keys = (lease: Pick<Lease, "key" | "sourceKey">) => [lease.key, `provider:${lease.sourceKey}`].sort();

/** Only short SQL work here. No HTTP, filesystem work, or sleep may occur in this transaction. */
export async function acquireLease(tx: SourceTransaction, key: string, sourceKey: string, now: Date, minIntervalMs = 1_000): Promise<{ lease: Lease } | { reason: "in_progress" | "source_backoff"; retryAfterSeconds: number }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`source-budget:${sourceKey}`}))`);
  const live = await tx.select().from(sourceLeases).where(and(inArray(sourceLeases.key, keys({ key, sourceKey })), gt(sourceLeases.expiresAt, now)));
  if (live.length) return { reason: "in_progress", retryAfterSeconds: 2 };
  const [budget] = await tx.select().from(sourceBudgets).where(eq(sourceBudgets.sourceKey, sourceKey));
  if (budget && budget.nextRequestAt > now) return { reason: "source_backoff", retryAfterSeconds: Math.max(1, Math.ceil((budget.nextRequestAt.getTime() - now.getTime()) / 1000)) };
  const lease = { key, sourceKey, owner: randomUUID() };
  for (const leaseKey of keys(lease)) await tx.insert(sourceLeases).values({ key: leaseKey, sourceKey, owner: lease.owner, expiresAt: new Date(now.getTime() + 30_000) }).onConflictDoUpdate({ target: sourceLeases.key, set: { owner: lease.owner, expiresAt: new Date(now.getTime() + 30_000) } });
  await tx.insert(sourceBudgets).values({ sourceKey, nextRequestAt: new Date(now.getTime() + minIntervalMs) }).onConflictDoUpdate({ target: sourceBudgets.sourceKey, set: { nextRequestAt: new Date(now.getTime() + minIntervalMs) } });
  return { lease };
}

/** Locks both ownership records until persistence commits: an expired owner cannot publish a late response. */
export async function ownsLease(tx: SourceTransaction, lease: Lease, now: Date) {
  const rows = await tx.select().from(sourceLeases).where(inArray(sourceLeases.key, keys(lease))).orderBy(sourceLeases.key).for("update");
  return rows.length === 2 && rows.every((row) => row.owner === lease.owner && row.expiresAt > now);
}

export async function releaseLease(tx: SourceTransaction, lease: Lease) {
  await tx.delete(sourceLeases).where(and(inArray(sourceLeases.key, keys(lease)), eq(sourceLeases.owner, lease.owner)));
}

export async function backoff(tx: SourceTransaction, sourceKey: string, now: Date, milliseconds: number) {
  const until = new Date(now.getTime() + Math.max(30_000, Math.min(86_400_000, milliseconds || 0)));
  await tx.insert(sourceBudgets).values({ sourceKey, nextRequestAt: until }).onConflictDoUpdate({ target: sourceBudgets.sourceKey, set: { nextRequestAt: sql`greatest(${sourceBudgets.nextRequestAt}, ${until.toISOString()}::timestamptz)` } });
  return until;
}
