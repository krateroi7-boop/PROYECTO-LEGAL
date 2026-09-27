import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, editorialDecisions, importBatches, normNodes, normVersions, norms, searchDocuments, sourceDocuments, sourcePolicies } from "@/db/schema";
import { FilesystemRawStorage } from "@/ingestion/storage";
import { publicationSourceKey, sourcePublicationAllowed } from "./source-policy";

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
  const db = getDb();
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1).for("update");
    if (!batch || batch.status !== "approved" || !batch.proposedVersionId || !batch.normId) {
      throw new Error("Only an approved batch with a proposed version can be published.");
    }
    const [norm] = await tx.select().from(norms).where(eq(norms.id, batch.normId)).limit(1).for("update");
    if (!norm) throw new Error("Norm for batch was not found.");
    const [version] = await tx.select().from(normVersions).where(eq(normVersions.id, batch.proposedVersionId)).limit(1).for("update");
    if (!version || version.publicationStatus !== "approved" || version.normId !== batch.normId) throw new Error("Proposed version is not approved for this document.");
    if (!version.sourceDocumentId || version.sourceDocumentId !== batch.sourceDocumentId) throw new Error("Proposed version has no matching source evidence.");
    const [source] = await tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, version.sourceDocumentId)).limit(1);
    if (!source) throw new Error("Source evidence was not found.");
    const sourceKey = publicationSourceKey(source);
    const [policy] = sourceKey ? await tx.select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, sourceKey)).limit(1).for("share") : [];
    if (!sourcePublicationAllowed(source, policy)) {
      throw new Error("Publication is blocked: the source requires a reviewed usage policy with authorization evidence.");
    }
    if (sourceKey || source.parser !== "local-fixture-v1") {
      const storageKey = source.originalObjectKey ?? source.storageKey;
      if (!storageKey) throw new Error("Publication requires preserved original source evidence.");
      const original = await new FilesystemRawStorage().get(storageKey);
      if (original.checksum !== source.checksum) throw new Error("Original source evidence checksum does not match.");
    }
    const publishedAt = new Date();
    await tx.update(importBatches).set({ status: "publishing", publishedBy: actorId }).where(eq(importBatches.id, batchId));
    // Editorial publication selects the visible representation; it does not establish legal expiry.
    await tx.update(normVersions).set({ isCurrent: false }).where(and(
      eq(normVersions.normId, batch.normId),
      eq(normVersions.isCurrent, true),
    ));
    await tx.update(normVersions).set({
      isCurrent: true,
      publicationStatus: "published",
      publishedAt,
      publishedBy: actorId,
      publicationBatchId: batchId,
    }).where(eq(normVersions.id, version.id));
    const document = source.normalizedContent;
    const publicNorm = document ? {
      ...norm,
      title: document.title,
      shortTitle: document.title,
      type: document.type,
      number: document.number,
      status: document.status,
      publishedAt: document.publishedAt ? new Date(document.publishedAt) : norm.publishedAt,
      updatedAt: document.versionDate ? new Date(document.versionDate) : norm.updatedAt,
    } : norm;
    if (document) await tx.update(norms).set({
      title: publicNorm.title, shortTitle: publicNorm.shortTitle, type: publicNorm.type,
      number: publicNorm.number, status: publicNorm.status,
      publishedAt: publicNorm.publishedAt, updatedAt: publicNorm.updatedAt,
    }).where(eq(norms.id, norm.id));
    await tx.delete(searchDocuments).where(eq(searchDocuments.normId, batch.normId));
    const nodes = await tx.select().from(normNodes).where(eq(normNodes.versionId, version.id));
    await tx.insert(searchDocuments).values([
      {
        normId: batch.normId,
        versionId: version.id,
        documentType: "norm",
        slug: norm.slug,
        number: publicNorm.number,
        type: publicNorm.type,
        title: publicNorm.title,
        topics: publicNorm.topics.join(" "),
        content: nodes.map((node) => node.text).join("\n"),
      },
      ...nodes.map((node) => ({
        normId: batch.normId!,
        versionId: version.id,
        nodeId: node.id,
        documentType: "node" as const,
        slug: norm.slug,
        number: publicNorm.number,
        type: publicNorm.type,
        title: node.title ?? node.label,
        topics: publicNorm.topics.join(" "),
        nodeLabel: node.label,
        content: node.text,
      })),
    ]);
    await tx.update(importBatches).set({ status: "published", publishedAt, completedAt: publishedAt }).where(eq(importBatches.id, batchId));
    await tx.insert(editorialDecisions).values({
      batchId,
      normId: batch.normId,
      versionId: version.id,
      actorId,
      action: "publish",
      previousStatus: "approved",
      newStatus: "published",
      reason,
      metadata: { sourceKey, usageEvidenceUrl: policy?.evidenceUrl ?? null, usageReviewedAt: policy?.reviewedAt?.toISOString() ?? null, sourceDocumentId: source.id },
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
