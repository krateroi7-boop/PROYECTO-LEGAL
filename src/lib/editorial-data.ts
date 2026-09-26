import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { importBatches, norms, normVersions } from "@/db/schema";

export async function getEditorialBatches() {
  if (!process.env.DATABASE_URL) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: importBatches.id,
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
    })
    .from(importBatches)
    .leftJoin(norms, eq(importBatches.normId, norms.id))
    .leftJoin(normVersions, eq(importBatches.proposedVersionId, normVersions.id))
    .orderBy(desc(importBatches.startedAt));
  return rows;
}
