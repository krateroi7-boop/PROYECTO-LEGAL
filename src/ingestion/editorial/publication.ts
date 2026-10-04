import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, editorialDecisions, importBatches, normVersions, norms, sourceDocuments, sourcePolicies } from "@/db/schema";
import { FilesystemRawStorage } from "@/ingestion/storage";
import { publicationSourceKey, sourcePublicationAllowed, automaticPublicationAllowed } from "./source-policy";
import { validateSourceDocument } from "@/sources/document-validation";
import type { SourceTransaction } from "@/sources/leases";
import { replaceSearchIndex } from "@/search/indexing";
export type VerifiedOriginal = { sourceId: string; checksum: string; storageKey: string };
export class AutomaticPublicationDeferred extends Error {}
type PublicationActor = { kind: "human"; actorId: string; reason?: string } | { kind: "system" };
/** Filesystem verification precedes all publication row locks. */
export async function verifyPublicationOriginal(batchId: string): Promise<VerifiedOriginal> {
  const [batch] = await getDb().select().from(importBatches).where(eq(importBatches.id, batchId));
  const [source] = batch?.sourceDocumentId ? await getDb().select().from(sourceDocuments).where(eq(sourceDocuments.id, batch.sourceDocumentId)) : [];
  if (!source) throw new Error("Source evidence was not found.");
  const storageKey = source.originalObjectKey ?? source.storageKey;
  if (!storageKey) throw new Error("Publication requires preserved original source evidence.");
  const original = await new FilesystemRawStorage().get(storageKey);
  if (original.checksum !== source.checksum) throw new Error("Original source evidence checksum does not match.");
  return { sourceId: source.id, checksum: source.checksum, storageKey };
}
export async function publishPreparedBatch(tx: SourceTransaction, batchId: string, actor: PublicationActor, verified: VerifiedOriginal) {
    const automatic = actor.kind === "system";
    const actorId = actor.kind === "human" ? actor.actorId : null;
    const reason = actor.kind === "human" ? actor.reason : "Publicación automática con validación técnica y política de fuente.";
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1).for("update");
    if (!batch || batch.status !== (automatic ? "pending_review" : "approved") || !batch.proposedVersionId || !batch.normId) {
      throw new Error("Only an approved batch with a proposed version can be published.");
    }
    const [norm] = await tx.select().from(norms).where(eq(norms.id, batch.normId)).limit(1).for("update");
    if (!norm) throw new Error("Norm for batch was not found.");
    const [version] = await tx.select().from(normVersions).where(eq(normVersions.id, batch.proposedVersionId)).limit(1).for("update");
    if (!version || version.publicationStatus !== (automatic ? "pending_review" : "approved") || version.normId !== batch.normId) throw new Error("Proposed version is not approved for this document.");
    if (!version.sourceDocumentId || version.sourceDocumentId !== batch.sourceDocumentId) throw new Error("Proposed version has no matching source evidence.");
    const [source] = await tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, version.sourceDocumentId)).limit(1).for("share");
    if (!source) throw new Error("Source evidence was not found.");
    const sourceKey = publicationSourceKey(source);
    const [policy] = sourceKey ? await tx.select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, sourceKey)).limit(1).for("share") : [];
    if (!sourcePublicationAllowed(source, policy)) {
      if (automatic) throw new AutomaticPublicationDeferred("Source policy changed.");
      throw new Error("Publication is blocked: the source requires a reviewed usage policy with authorization evidence.");
    }
    if (source.id !== verified.sourceId || source.checksum !== verified.checksum || (source.originalObjectKey ?? source.storageKey) !== verified.storageKey) throw new Error("Original evidence changed after verification.");
    if (!source.normalizedContent) throw new Error("Publication requires a normalized document and validation report.");
    const report = validateSourceDocument(source.normalizedContent);
    if (!report.complete || !source.normalizedContent.validation?.complete) throw new Error("Publication blocked by incomplete technical validation.");
    if (automatic) {
      if (!automaticPublicationAllowed(source, policy)) throw new AutomaticPublicationDeferred("Automatic publication is not authorized for this parser and usage scope.");
      const conflicts = await tx.select({ id: importBatches.id }).from(importBatches).where(and(eq(importBatches.normId, norm.id), ne(importBatches.id, batchId), inArray(importBatches.status, ["pending_review", "approved"])));
      if (conflicts.length || report.issues.some((issue) => issue.severity === "warning") || source.normalizedContent.validation.issues.some((issue) => issue.severity !== "info")) throw new AutomaticPublicationDeferred("Automatic publication requires editorial review.");
      const [current] = await tx.select({ sourceId: normVersions.sourceDocumentId }).from(normVersions).where(and(eq(normVersions.normId, norm.id), eq(normVersions.isCurrent, true)));
      if (current?.sourceId) {
        const [previous] = await tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, current.sourceId));
        const update = validateSourceDocument(source.normalizedContent, undefined, previous?.normalizedContent);
        if (!update.complete || update.issues.some((issue) => issue.severity !== "info")) throw new AutomaticPublicationDeferred("Update requires editorial review.");
      }
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
    await replaceSearchIndex(tx, publicNorm, version.id);
    await tx.update(importBatches).set({ status: "published", publishedAt, completedAt: publishedAt }).where(eq(importBatches.id, batchId));
    await tx.insert(editorialDecisions).values({
      batchId,
      normId: batch.normId,
      versionId: version.id,
      actorId,
      action: automatic ? "auto_publish_validated" : "publish",
      previousStatus: automatic ? "pending_review" : "approved",
      newStatus: "published",
      reason,
      metadata: { sourceKey, usageEvidenceUrl: policy?.evidenceUrl ?? null, usageReviewedAt: policy?.reviewedAt?.toISOString() ?? null, sourceDocumentId: source.id, checksum: source.checksum, parser: source.parser, validation: report, publicationMode: policy?.publicationMode, usageScope: policy?.usageScope },
    });
    await tx.insert(auditLogs).values({
      actorId,
      action: automatic ? "import_batch.auto_publish_validated" : "import_batch.publish",
      entityType: "import_batch",
      entityId: batchId,
      result: "success",
      metadata: { versionId: version.id },
    });
    return { batchId, versionId: version.id, status: "published" };
}
