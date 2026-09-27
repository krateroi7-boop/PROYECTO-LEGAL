import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { importBatches, norms, normNodes, normVersions, sourceDocuments, sourcePolicies } from "@/db/schema";
import { publicationSourceKey, sourcePublicationAllowed } from "@/ingestion/editorial/source-policy";

/** Callers must authorize reviewers before invoking this private data access. */
export async function getEditorialDetail(batchId: string) {
  const db = getDb();
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch?.sourceDocumentId || !batch.proposedVersionId || !batch.normId) return undefined;
  const [source] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, batch.sourceDocumentId));
  const [norm] = await db.select().from(norms).where(eq(norms.id, batch.normId));
  if (!source || !norm) return undefined;
  const nodes = await db.select().from(normNodes).where(eq(normNodes.versionId, batch.proposedVersionId)).orderBy(asc(normNodes.position));
  const [current] = await db.select().from(normVersions).where(and(eq(normVersions.normId, norm.id), eq(normVersions.isCurrent, true), eq(normVersions.publicationStatus, "published")));
  const previousNodes = current ? await db.select().from(normNodes).where(eq(normNodes.versionId, current.id)).orderBy(asc(normNodes.position)) : [];
  const sourceKey = publicationSourceKey(source);
  const [policy] = sourceKey ? await db.select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, sourceKey)) : [];
  return { batch, source, norm, nodes, previousNodes, publicationAllowed: sourcePublicationAllowed(source, policy) };
}
