import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { annotations, favorites, normNodes, normVersions, norms } from "@/db/schema";

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
  return getDb().select().from(favorites).where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt));
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
  return getDb().select().from(annotations).where(eq(annotations.userId, userId)).orderBy(desc(annotations.updatedAt));
}

export async function createAnnotation(input: { userId: string; normId: string; versionId?: string; nodeId?: string; content: string }) {
  const content = input.content.trim();
  if (!content) throw new Error("Annotation content cannot be empty.");
  if (content.length > 10_000) throw new Error("Annotation content is too long.");
  await assertLegalTarget(input);
  return getDb().insert(annotations).values({ ...input, content, updatedAt: new Date() }).returning();
}
