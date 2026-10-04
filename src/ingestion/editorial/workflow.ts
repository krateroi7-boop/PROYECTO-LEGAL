import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, editorialDecisions, importBatches, normVersions } from "@/db/schema";
import { verifyPublicationOriginal, publishPreparedBatch } from "./publication";

export async function approveImportBatch(batchId: string, actorId: string, reason?: string) {
  return transitionBatch(batchId, "approved", actorId, reason);
}

export async function rejectImportBatch(batchId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new Error("A rejection reason is required.");
  return transitionBatch(batchId, "rejected", actorId, reason);
}

async function transitionBatch(batchId: string, nextStatus: "approved" | "rejected", actorId: string, reason?: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1).for("update");
    if (!batch) throw new Error("Import batch not found.");
    if (batch.status !== "pending_review") throw new Error(`Batch cannot transition from ${batch.status}.`);
    await tx.update(importBatches).set({
      status: nextStatus,
      reviewedBy: actorId,
      reviewedAt: new Date(),
      rejectionReason: nextStatus === "rejected" ? reason : null,
    }).where(and(eq(importBatches.id, batchId), eq(importBatches.status, "pending_review")));
    if (batch.proposedVersionId) {
      await tx.update(normVersions).set({
        publicationStatus: nextStatus === "approved" ? "approved" : "rejected",
      }).where(eq(normVersions.id, batch.proposedVersionId));
    }
    await tx.insert(editorialDecisions).values({
      batchId,
      normId: batch.normId,
      versionId: batch.proposedVersionId,
      actorId,
      action: nextStatus === "approved" ? "approve" : "reject",
      previousStatus: "pending_review",
      newStatus: nextStatus,
      reason,
    });
    await tx.insert(auditLogs).values({
      actorId,
      action: `import_batch.${nextStatus}`,
      entityType: "import_batch",
      entityId: batchId,
      result: "success",
      metadata: { previousStatus: "pending_review", newStatus: nextStatus, reason },
    });
    return { batchId, status: nextStatus };
  });
}

export async function publishImportBatch(batchId: string, actorId: string, reason?: string) {
  const verified = await verifyPublicationOriginal(batchId);
  return getDb().transaction((tx) => publishPreparedBatch(tx, batchId, { kind: "human", actorId, reason }, verified));
}
