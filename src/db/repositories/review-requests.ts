import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, editorialReviewRequests, importBatches, norms } from "@/db/schema";

export async function requestReview(userId: string, batchId: string, at = new Date()) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`review-request:${userId}`}))`);
    const [existing] = await tx.select().from(editorialReviewRequests).where(and(eq(editorialReviewRequests.userId, userId), eq(editorialReviewRequests.batchId, batchId)));
    if (existing) return existing;
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).for("share");
    if (!batch || !["pending_review", "approved"].includes(batch.status)) throw new Error("REVIEW_NOT_REQUESTABLE");
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(editorialReviewRequests).where(and(eq(editorialReviewRequests.userId, userId), gte(editorialReviewRequests.createdAt, new Date(at.getTime() - 86_400_000))));
    if (count >= 5) throw new Error("REVIEW_QUOTA");
    const [request] = await tx.insert(editorialReviewRequests).values({ userId, batchId, createdAt: at }).returning();
    await tx.insert(auditLogs).values({ actorId: userId, action: "review.request", entityType: "import_batch", entityId: batchId, result: "success" });
    return request;
  });
}

export async function listReviewRequests(userId: string) {
  return getDb().select({ id: editorialReviewRequests.id, createdAt: editorialReviewRequests.createdAt, status: importBatches.status, title: norms.title }).from(editorialReviewRequests).innerJoin(importBatches, eq(importBatches.id, editorialReviewRequests.batchId)).leftJoin(norms, eq(norms.id, importBatches.normId)).where(eq(editorialReviewRequests.userId, userId)).orderBy(desc(editorialReviewRequests.createdAt));
}
