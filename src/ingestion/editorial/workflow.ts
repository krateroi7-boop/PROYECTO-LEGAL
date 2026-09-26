import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, editorialDecisions, importBatches, normNodes, normVersions, norms, searchDocuments } from "@/db/schema";

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
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
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
  const db = getDb();
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (!batch || batch.status !== "approved" || !batch.proposedVersionId || !batch.normId) {
      throw new Error("Only an approved batch with a proposed version can be published.");
    }
    await tx.update(importBatches).set({ status: "publishing", publishedBy: actorId }).where(eq(importBatches.id, batchId));
    const [version] = await tx.select().from(normVersions).where(eq(normVersions.id, batch.proposedVersionId)).limit(1);
    if (!version || version.publicationStatus !== "approved") throw new Error("Proposed version is not approved.");
    const [norm] = await tx.select().from(norms).where(eq(norms.id, batch.normId)).limit(1);
    if (!norm) throw new Error("Norm for batch was not found.");
    await tx.update(normVersions).set({ isCurrent: false, validTo: new Date() }).where(and(
      eq(normVersions.normId, batch.normId),
      eq(normVersions.isCurrent, true),
    ));
    await tx.update(normVersions).set({
      isCurrent: true,
      publicationStatus: "published",
      publishedAt: new Date(),
      publishedBy: actorId,
      publicationBatchId: batchId,
    }).where(eq(normVersions.id, version.id));
    await tx.delete(searchDocuments).where(eq(searchDocuments.normId, batch.normId));
    const nodes = await tx.select().from(normNodes).where(eq(normNodes.versionId, version.id));
    await tx.insert(searchDocuments).values([
      {
        normId: batch.normId,
        versionId: version.id,
        documentType: "norm",
        slug: norm.slug,
        number: norm.number,
        type: norm.type,
        title: norm.title,
        topics: "",
        content: nodes.map((node) => node.text).join("\n"),
      },
      ...nodes.map((node) => ({
        normId: batch.normId!,
        versionId: version.id,
        nodeId: node.id,
        documentType: "node" as const,
        slug: norm.slug,
        number: norm.number,
        type: norm.type,
        title: node.title ?? node.label,
        topics: "",
        nodeLabel: node.label,
        content: node.text,
      })),
    ]);
    await tx.update(importBatches).set({ status: "published", publishedAt: new Date() }).where(eq(importBatches.id, batchId));
    await tx.insert(editorialDecisions).values({
      batchId,
      normId: batch.normId,
      versionId: version.id,
      actorId,
      action: "publish",
      previousStatus: "approved",
      newStatus: "published",
      reason,
    });
    await tx.insert(auditLogs).values({
      actorId,
      action: "import_batch.publish",
      entityType: "import_batch",
      entityId: batchId,
      result: "success",
      metadata: { versionId: version.id },
    });
    return { batchId, versionId: version.id, status: "published" };
  });
}
