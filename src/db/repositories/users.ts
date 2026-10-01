import { and, desc, eq, isNull, getTableColumns, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { annotations, favorites, normNodes, normVersions, norms } from "@/db/schema";

import { publicVersionCondition } from "@/db/public-visibility";
import { presentVersion } from "@/lib/reader/presentation";
import { readerHeading, readerUrl } from "@/lib/reader/structure";
import { alias } from "drizzle-orm/pg-core";

// Keep private references even if a publication is withdrawn; only attach public labels.
const visibleVersion = alias(normVersions, "account_visible_version");
function contextColumns(table: typeof favorites | typeof annotations) {
  return {
    slug: norms.slug, normType: norms.type, number: norms.number, normTitle: norms.shortTitle,
    stableKey: normNodes.stableKey, nodeLabel: normNodes.label, nodeTitle: normNodes.title,
    isCurrent: normVersions.isCurrent, validFrom: normVersions.validFrom, sourceVersionDate: normVersions.sourceVersionDate,
    available: sql<boolean>`case when ${table.versionId} is not null then (${publicVersionCondition()}) else exists (select 1 from norm_versions account_visible_version where ${visibleVersion.normId} = ${table.normId} and ${publicVersionCondition(visibleVersion)}) end`,
  };
}
function withContext<T extends { versionId: string | null; available: boolean | null; slug: string | null; normType: string | null; number: string | null; normTitle: string | null; stableKey: string | null; nodeLabel: string | null; nodeTitle: string | null; isCurrent: boolean | null; validFrom: Date | null; sourceVersionDate: Date | null }>(row: T) {
  return { ...row, context: row.available && row.slug ? {
    name: `${row.normType} ${row.number}`, title: row.normTitle,
    article: row.nodeLabel ? readerHeading({ label: row.nodeLabel, title: row.nodeTitle }) : null,
    href: readerUrl(row.slug, row.versionId ?? undefined, row.stableKey ?? undefined),
    version: row.versionId ? presentVersion({ isCurrent: row.isCurrent ?? false, validFrom: row.validFrom, sourceVersionDate: row.sourceVersionDate }) : null,
  } : null };
}

type LegalTarget = {
  normId: string;
  versionId?: string;
  nodeId?: string;
};

async function assertLegalTarget(target: LegalTarget) {
  const db = getDb();
  const norm = await db.select({ id: norms.id }).from(norms).where(eq(norms.id, target.normId)).limit(1);
  if (!norm.length) throw new Error("The referenced norm does not exist.");

  if (target.versionId) {
    const version = await db.select({ normId: normVersions.normId })
      .from(normVersions)
      .where(eq(normVersions.id, target.versionId))
      .limit(1);
    if (!version.length || version[0].normId !== target.normId) {
      throw new Error("The referenced version does not belong to the norm.");
    }
  }

  if (target.nodeId) {
    const node = await db.select({ versionId: normNodes.versionId })
      .from(normNodes)
      .where(eq(normNodes.id, target.nodeId))
      .limit(1);
    if (!node.length || !target.versionId || node[0].versionId !== target.versionId) {
      throw new Error("The referenced article does not belong to the selected version.");
    }
  }
}

export async function listFavorites(userId: string) {
  const rows = await getDb().select({ ...getTableColumns(favorites), ...contextColumns(favorites) }).from(favorites)
    .leftJoin(norms, eq(norms.id, favorites.normId)).leftJoin(normVersions, and(eq(normVersions.id, favorites.versionId), eq(normVersions.normId, favorites.normId)))
    .leftJoin(normNodes, and(eq(normNodes.id, favorites.nodeId), eq(normNodes.versionId, favorites.versionId)))
    .where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt));
  return rows.map(withContext);
}

export async function createFavorite(input: { userId: string; normId: string; versionId?: string; nodeId?: string }) {
  await assertLegalTarget(input);
  const existing = await getDb().select().from(favorites).where(and(
    eq(favorites.userId, input.userId),
    eq(favorites.normId, input.normId),
    input.versionId ? eq(favorites.versionId, input.versionId) : isNull(favorites.versionId),
    input.nodeId ? eq(favorites.nodeId, input.nodeId) : isNull(favorites.nodeId),
  )).limit(1);
  if (existing.length) return existing;
  return getDb().insert(favorites).values(input).returning();
}

export async function deleteFavorite(userId: string, favoriteId: string) {
  return getDb().delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.id, favoriteId))).returning();
}

export async function listAnnotations(userId: string) {
  const rows = await getDb().select({ ...getTableColumns(annotations), ...contextColumns(annotations) }).from(annotations)
    .leftJoin(norms, eq(norms.id, annotations.normId)).leftJoin(normVersions, and(eq(normVersions.id, annotations.versionId), eq(normVersions.normId, annotations.normId)))
    .leftJoin(normNodes, and(eq(normNodes.id, annotations.nodeId), eq(normNodes.versionId, annotations.versionId)))
    .where(eq(annotations.userId, userId)).orderBy(desc(annotations.updatedAt));
  return rows.map(withContext);
}

export async function createAnnotation(input: { userId: string; normId: string; versionId?: string; nodeId?: string; content: string }) {
  const content = input.content.trim();
  if (!content) throw new Error("Annotation content cannot be empty.");
  if (content.length > 10_000) throw new Error("Annotation content is too long.");
  await assertLegalTarget(input);
  return getDb().insert(annotations).values({ ...input, content, updatedAt: new Date() }).returning();
}
