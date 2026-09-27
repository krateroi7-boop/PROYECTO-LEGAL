"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { publicVersionCondition } from "@/db/public-visibility";
import { annotations, favorites, normNodes, normVersions, norms } from "@/db/schema";

const targetSchema = z.object({
  slug: z.string().min(1).max(200),
  stableKey: z.string().max(200).optional(),
  versionId: z.string().uuid().optional(),
});

const noteSchema = targetSchema.extend({
  content: z.string().trim().min(1).max(10_000),
});
const idSchema = z.string().uuid();

async function resolveTarget(input: z.infer<typeof targetSchema>) {
  const db = getDb();
  const norm = await db.select({ id: norms.id })
    .from(norms)
    .where(eq(norms.slug, input.slug))
    .limit(1);
  if (!norm[0]) throw new Error("La norma indicada no existe.");

  const version = await db.select({ id: normVersions.id })
    .from(normVersions)
    .where(and(
      eq(normVersions.normId, norm[0].id),
      publicVersionCondition(),
      input.versionId ? eq(normVersions.id, input.versionId) : eq(normVersions.isCurrent, true),
    ))
    .limit(1);
  if (!version[0]) throw new Error("La norma no tiene una versión vigente publicada.");

  if (!input.stableKey) {
    return { normId: norm[0].id, versionId: version[0].id, nodeId: undefined };
  }

  const node = await db.select({ id: normNodes.id })
    .from(normNodes)
    .where(and(eq(normNodes.versionId, version[0].id), eq(normNodes.stableKey, input.stableKey)))
    .limit(1);
  if (!node[0]) throw new Error("El artículo indicado no existe en la versión vigente.");
  return { normId: norm[0].id, versionId: version[0].id, nodeId: node[0].id };
}

async function requireAuthenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Debes iniciar sesión para usar esta función.");
  return session.user.id;
}

export async function toggleFavorite(formData: FormData) {
  const userId = await requireAuthenticatedUser();
  const slug = targetSchema.parse({
    slug: formData.get("slug"),
    stableKey: formData.get("stableKey") || undefined,
    versionId: formData.get("versionId") || undefined,
  });
  const target = await resolveTarget(slug);
  const db = getDb();
  const conditions = [
    eq(favorites.userId, userId),
    eq(favorites.normId, target.normId),
    eq(favorites.versionId, target.versionId),
    target.nodeId ? eq(favorites.nodeId, target.nodeId) : isNull(favorites.nodeId),
  ];
  const existing = await db.select({ id: favorites.id }).from(favorites).where(and(...conditions)).limit(1);
  if (existing[0]) {
    await db.delete(favorites).where(and(eq(favorites.id, existing[0].id), eq(favorites.userId, userId)));
  } else {
    await db.insert(favorites).values({ userId, ...target });
  }
  revalidatePath(`/normas/${slug.slug}`);
  revalidatePath("/cuenta/favoritos");
}

export async function createAnnotation(formData: FormData) {
  const userId = await requireAuthenticatedUser();
  const input = noteSchema.parse({
    slug: formData.get("slug"),
    stableKey: formData.get("stableKey") || undefined,
    versionId: formData.get("versionId") || undefined,
    content: formData.get("content"),
  });
  const target = await resolveTarget(input);
  await getDb().insert(annotations).values({
    userId,
    ...target,
    content: input.content,
    updatedAt: new Date(),
  });
  revalidatePath(`/normas/${input.slug}`);
  revalidatePath("/cuenta/notas");
}

export async function deleteFavoriteAction(formData: FormData) {
  const userId = await requireAuthenticatedUser();
  const id = idSchema.parse(formData.get("id"));
  await getDb().delete(favorites).where(and(eq(favorites.id, id), eq(favorites.userId, userId)));
  revalidatePath("/cuenta/favoritos");
}

export async function deleteAnnotationAction(formData: FormData) {
  const userId = await requireAuthenticatedUser();
  const id = idSchema.parse(formData.get("id"));
  await getDb().delete(annotations).where(and(eq(annotations.id, id), eq(annotations.userId, userId)));
  revalidatePath("/cuenta/notas");
}
