"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { annotations, favorites, norms, normVersions, normNodes } from "@/db/schema";
import { publicVersionCondition } from "@/db/public-visibility";
import { publicIdSchema, publicSlugSchema, stableKeySchema } from "@/api/contracts";
import { getReaderChanges, getReaderDocument, getReaderRelations } from "@/lib/reader/data";
import type { ReaderPersonal, ReaderTarget } from "@/lib/reader/types";

const targetSchema = z.object({ slug: publicSlugSchema, versionId: z.string().min(1).max(200).optional(), stableKey: stableKeySchema.optional() });

async function visibleTarget(input: ReaderTarget) {
  const target = targetSchema.parse(input);
  if (process.env.DATABASE_URL) {
    if (target.versionId && !publicIdSchema.safeParse(target.versionId).success) throw new Error("Contenido no disponible.");
    // Context authorization only needs identities, not another copy of the legal text.
    const db = getDb();
    const [identity] = await db.select({ id: norms.id, versionId: normVersions.id }).from(norms)
      .innerJoin(normVersions, eq(normVersions.normId, norms.id))
      .where(and(eq(norms.slug, target.slug), publicVersionCondition(), target.versionId ? eq(normVersions.id, target.versionId) : undefined))
      .orderBy(desc(normVersions.isCurrent), desc(sql`coalesce(${normVersions.validFrom}, ${normVersions.sourceVersionDate}, ${normVersions.createdAt})`), desc(normVersions.id)).limit(1);
    if (!identity) throw new Error("Contenido no disponible.");
    const [node] = target.stableKey ? await db.select({ id: normNodes.id }).from(normNodes)
      .where(and(eq(normNodes.versionId, identity.versionId), eq(normNodes.stableKey, target.stableKey))).limit(1) : [];
    if (target.stableKey && !node) throw new Error("Contenido no disponible.");
    return { doc: { id: identity.id, slug: target.slug, version: { id: identity.versionId } }, node };
  }
  const doc = await getReaderDocument(target.slug, target.versionId);
  if (!doc || (target.stableKey && !doc.nodes.some((node) => node.stableKey === target.stableKey))) throw new Error("Contenido no disponible.");
  return { doc, node: doc.nodes.find((node) => node.stableKey === target.stableKey) };
}

export async function loadReaderRelations(input: ReaderTarget) {
  const { doc } = await visibleTarget(input);
  return getReaderRelations(doc);
}

export async function loadReaderChanges(input: ReaderTarget) {
  const { doc } = await visibleTarget(input);
  return doc.version ? (await getReaderChanges(doc.slug, doc.version.id)) ?? null : null;
}

export async function loadReaderPersonal(input: ReaderTarget): Promise<ReaderPersonal> {
  const { doc, node } = await visibleTarget(input);
  const userId = process.env.DATABASE_URL ? (await auth())?.user?.id : undefined;
  if (!userId || !doc.id || !doc.version) return { authenticated: false, favorite: false, notes: [] };
  const db = getDb();
  const [saved, notes] = await Promise.all([
    db.select({ id: favorites.id }).from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.normId, doc.id), eq(favorites.versionId, doc.version.id), node?.id ? eq(favorites.nodeId, node.id) : isNull(favorites.nodeId))).limit(1),
    db.select({ id: annotations.id, content: annotations.content, updatedAt: annotations.updatedAt }).from(annotations).where(and(eq(annotations.userId, userId), eq(annotations.normId, doc.id), eq(annotations.versionId, doc.version.id), node?.id ? eq(annotations.nodeId, node.id) : isNull(annotations.nodeId))).orderBy(desc(annotations.updatedAt)),
  ]);
  return { authenticated: true, favorite: saved.length > 0, notes: notes.map((n) => ({ ...n, updatedAt: n.updatedAt.toISOString() })) };
}
