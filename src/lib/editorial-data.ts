import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { editorialReviewRequests, importBatches, norms, normVersions, sourceDocuments, sourcePolicies } from "@/db/schema";
import { sourcePublicationAllowed } from "@/ingestion/editorial/source-policy";

export async function getEditorialBatches() {
  if (!process.env.DATABASE_URL) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: importBatches.id,
      reviewRequestCount: sql<number>`(select count(*)::int from ${editorialReviewRequests} where ${editorialReviewRequests.batchId} = ${importBatches.id})`,
      oldestReviewRequest: sql<string | null>`(select min(${editorialReviewRequests.createdAt})::text from ${editorialReviewRequests} where ${editorialReviewRequests.batchId} = ${importBatches.id})`,
      checksum: importBatches.checksum,
      status: importBatches.status,
      itemCount: importBatches.itemCount,
      startedAt: importBatches.startedAt,
      reviewedAt: importBatches.reviewedAt,
      publishedAt: importBatches.publishedAt,
      rejectionReason: importBatches.rejectionReason,
      normSlug: norms.slug,
      normTitle: norms.title,
      versionId: normVersions.id,
      versionLabel: normVersions.versionLabel,
      publicationStatus: normVersions.publicationStatus,
      sourceName: sourceDocuments.sourceName,
      sourceKey: sourceDocuments.sourceKey,
      sourceParser: sourceDocuments.parser,
      sourceUrl: sourceDocuments.sourceUrl,
      sourceCapturedAt: sourceDocuments.capturedAt,
      usageAllowed: sourcePolicies.publicationAllowed,
      usageEvidenceUrl: sourcePolicies.evidenceUrl,
      usageReviewedAt: sourcePolicies.reviewedAt,
      usageReviewedBy: sourcePolicies.reviewedBy,
    })
    .from(importBatches)
    .leftJoin(norms, eq(importBatches.normId, norms.id))
    .leftJoin(normVersions, eq(importBatches.proposedVersionId, normVersions.id))
    .leftJoin(sourceDocuments, eq(importBatches.sourceDocumentId, sourceDocuments.id))
    .leftJoin(sourcePolicies, eq(sourcePolicies.sourceKey, sql`coalesce(${sourceDocuments.sourceKey}, case when ${sourceDocuments.sourceName} = 'BCN LeyChile' then 'bcn-leychile' end)`))
    .orderBy(desc(importBatches.startedAt));
  return rows.map((row) => ({ ...row, publicationAllowed: Boolean(row.sourceName && row.sourceParser && sourcePublicationAllowed({
    sourceKey: row.sourceKey, sourceName: row.sourceName, parser: row.sourceParser,
  }, {
    publicationAllowed: row.usageAllowed ?? false, evidenceUrl: row.usageEvidenceUrl,
    reviewedAt: row.usageReviewedAt, reviewedBy: row.usageReviewedBy,
  })) }));
}
