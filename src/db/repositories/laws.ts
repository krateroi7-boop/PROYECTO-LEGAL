import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { normNodes, normVersions, norms } from "@/db/schema";
import type { Law } from "@/lib/legislation";

export async function listPersistedLaws(): Promise<Law[]> {
  const db = getDb();
  const rows = await db.select().from(norms).orderBy(asc(norms.number));
  return Promise.all(rows.map(toLaw));
}

export async function getPersistedLaw(slug: string): Promise<Law | undefined> {
  const db = getDb();
  const rows = await db.select().from(norms).where(eq(norms.slug, slug)).limit(1);
  return rows[0] ? toLaw(rows[0]) : undefined;
}

async function toLaw(row: typeof norms.$inferSelect): Promise<Law> {
  const db = getDb();
  const versions = await db.select().from(normVersions).where(and(
    eq(normVersions.normId, row.id),
    eq(normVersions.publicationStatus, "published"),
  )).orderBy(asc(normVersions.validFrom));
  const version = versions.find((candidate) => candidate.isCurrent) ?? versions.at(-1);
  const nodes = version
    ? await db.select().from(normNodes).where(eq(normNodes.versionId, version.id)).orderBy(asc(normNodes.position))
    : [];
  const articles = nodes.filter((node) => node.type === "articulo").map((node) => ({
    id: node.stableKey,
    number: node.label.replace(/^Artículo\s+/i, ""),
    title: node.title ?? undefined,
    paragraphs: node.text.split("\n\n"),
  }));
  return {
    slug: row.slug,
    type: row.type,
    number: row.number,
    title: row.title,
    shortTitle: row.shortTitle,
    status: row.status === "modificada" ? "Modificada" : "Vigente",
    published: row.publishedAt.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }),
    updated: `Última modificación: ${row.updatedAt.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}`,
    description: row.description,
    topics: row.topics,
    articles,
  };
}
