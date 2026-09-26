import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { legalRelations, normNodes, normVersions, norms, sourceDocuments } from "@/db/schema";
import type { ArticleDto, NormDetailDto, NormSummaryDto, RelationDto, VersionDto } from "@/api/contracts";
import { mapProvenance, mapVersion } from "@/api/mappers/legislation";

async function getNorm(slug: string) {
  const rows = await getDb().select().from(norms).where(eq(norms.slug, slug)).limit(1);
  return rows[0];
}

async function getVersion(normId: string, versionId?: string) {
  const db = getDb();
  if (versionId) {
    const rows = await db.select().from(normVersions).where(and(eq(normVersions.id, versionId), eq(normVersions.normId, normId))).limit(1);
    return rows[0];
  }
  const current = await db.select().from(normVersions).where(and(
    eq(normVersions.normId, normId),
    eq(normVersions.isCurrent, true),
    eq(normVersions.publicationStatus, "published"),
  )).limit(1);
  return current[0] ?? (await db.select().from(normVersions).where(and(
    eq(normVersions.normId, normId),
    eq(normVersions.publicationStatus, "published"),
  )).orderBy(desc(normVersions.validFrom)).limit(1))[0];
}

async function mapVersionWithSource(version: typeof normVersions.$inferSelect): Promise<VersionDto> {
  const source = version.sourceDocumentId
    ? (await getDb().select().from(sourceDocuments).where(eq(sourceDocuments.id, version.sourceDocumentId)).limit(1))[0]
    : undefined;
  return mapVersion({
    ...version,
    provenance: source ? mapProvenance({ ...source }) : undefined,
  });
}

export async function listApiNorms(): Promise<NormSummaryDto[]> {
  const rows = await getDb().select().from(norms).where(sql`exists (
    select 1 from ${normVersions}
    where ${normVersions.normId} = ${norms.id}
      and ${normVersions.publicationStatus} = 'published'
  )`).orderBy(asc(norms.number));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    type: row.type,
    number: row.number,
    title: row.title,
    shortTitle: row.shortTitle,
    description: row.description,
    status: row.status,
    topics: row.topics,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function listApiNormsPage(page: number, limit: number) {
  const offset = (page - 1) * limit;
  const rows = await getDb().select().from(norms).where(sql`exists (
    select 1 from ${normVersions}
    where ${normVersions.normId} = ${norms.id}
      and ${normVersions.publicationStatus} = 'published'
  )`).orderBy(asc(norms.number), asc(norms.id)).limit(limit + 1).offset(offset);
  const hasNext = rows.length > limit;
  return {
    items: rows.slice(0, limit).map((row) => ({
      id: row.id,
      slug: row.slug,
      type: row.type,
      number: row.number,
      title: row.title,
      shortTitle: row.shortTitle,
      description: row.description,
      status: row.status,
      topics: row.topics,
      publishedAt: row.publishedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    hasNext,
  };
}

export async function getApiNormDetail(slug: string, versionId?: string): Promise<NormDetailDto | undefined> {
  const norm = await getNorm(slug);
  if (!norm) return undefined;
  const version = await getVersion(norm.id, versionId);
  if (!version) return undefined;
  const nodes = await getDb().select().from(normNodes).where(eq(normNodes.versionId, version.id)).orderBy(asc(normNodes.position));
  const source = version.sourceDocumentId
    ? (await getDb().select().from(sourceDocuments).where(eq(sourceDocuments.id, version.sourceDocumentId)).limit(1))[0]
    : undefined;
  const articles: ArticleDto[] = nodes.map((node) => ({
    id: node.id,
    stableKey: node.stableKey,
    type: node.type,
    label: node.label,
    title: node.title,
    text: node.text,
    position: node.position,
    parentStableKey: null,
  }));
  return {
    id: norm.id,
    slug: norm.slug,
    type: norm.type,
    number: norm.number,
    title: norm.title,
    shortTitle: norm.shortTitle,
    description: norm.description,
    status: norm.status,
    topics: norm.topics,
    publishedAt: norm.publishedAt.toISOString(),
    updatedAt: norm.updatedAt.toISOString(),
    currentVersion: await mapVersionWithSource(version),
    articles,
    provenance: source ? mapProvenance({ ...source }) : undefined,
  };
}

export async function listApiVersions(slug: string): Promise<VersionDto[] | undefined> {
  const norm = await getNorm(slug);
  if (!norm) return undefined;
  const versions = await getDb().select().from(normVersions).where(and(
    eq(normVersions.normId, norm.id),
    eq(normVersions.publicationStatus, "published"),
  )).orderBy(desc(normVersions.validFrom));
  return Promise.all(versions.map(mapVersionWithSource));
}

export async function getApiArticle(slug: string, stableKey: string, versionId?: string): Promise<ArticleDto | undefined> {
  const norm = await getNorm(slug);
  if (!norm) return undefined;
  const version = await getVersion(norm.id, versionId);
  if (!version) return undefined;
  const node = await getDb().select().from(normNodes).where(and(eq(normNodes.versionId, version.id), eq(normNodes.stableKey, stableKey))).limit(1);
  if (!node[0]) return undefined;
  return {
    id: node[0].id,
    stableKey: node[0].stableKey,
    type: node[0].type,
    label: node[0].label,
    title: node[0].title,
    text: node[0].text,
    position: node[0].position,
    parentStableKey: null,
  };
}

export async function listApiRelations(slug: string): Promise<RelationDto[] | undefined> {
  const norm = await getNorm(slug);
  if (!norm) return undefined;
  const db = getDb();
  const rows = await db.select().from(legalRelations).where(
    and(eq(legalRelations.status, "verified"), eq(legalRelations.sourceNormId, norm.id)),
  );
  const result: RelationDto[] = [];
  for (const row of rows) {
    const target = await db.select({ slug: norms.slug }).from(norms).where(eq(norms.id, row.targetNormId)).limit(1);
    if (!target[0]) continue;
    const [sourceNode] = row.sourceNodeId
      ? await db.select({ stableKey: normNodes.stableKey }).from(normNodes).where(eq(normNodes.id, row.sourceNodeId)).limit(1)
      : [];
    const [targetNode] = row.targetNodeId
      ? await db.select({ stableKey: normNodes.stableKey }).from(normNodes).where(eq(normNodes.id, row.targetNodeId)).limit(1)
      : [];
    const [evidenceSource] = row.evidenceSourceDocumentId
      ? await db.select({ id: sourceDocuments.id, capturedAt: sourceDocuments.capturedAt })
        .from(sourceDocuments)
        .where(eq(sourceDocuments.id, row.evidenceSourceDocumentId))
        .limit(1)
      : [];
    result.push({
      id: row.id,
      source: { normSlug: slug, stableKey: sourceNode?.stableKey },
      target: { normSlug: target[0].slug, stableKey: targetNode?.stableKey },
      type: row.type,
      status: row.status,
      evidence: row.evidence,
      evidenceFragment: row.evidenceFragment ?? undefined,
      method: row.method === "manual" || row.method === "parser" || row.method === "import" ? row.method : "import",
      provenance: evidenceSource ? {
        sourceDocumentId: evidenceSource.id,
        capturedAt: evidenceSource.capturedAt.toISOString(),
      } : undefined,
    });
  }
  return result;
}
