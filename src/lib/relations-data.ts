import type { LegalRelation } from "@/domain/relations/types";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { legalRelations, norms } from "@/db/schema";

const relations: LegalRelation[] = [
  {
    id: "rel-19880-20285",
    sourceSlug: "ley-19880",
    sourceLabel: "Ley 19.880",
    targetSlug: "ley-20285",
    targetLabel: "Ley 20.285",
    type: "complementa",
    status: "verified",
    evidence: "Ambas normas regulan principios de transparencia y actuación de órganos de la Administración del Estado.",
    method: "manual",
  },
  {
    id: "rel-19628-20285",
    sourceSlug: "ley-19628",
    sourceLabel: "Ley 19.628",
    targetSlug: "ley-20285",
    targetLabel: "Ley 20.285",
    type: "relacionada",
    status: "pending",
    evidence: "Referencia detectada por coincidencia temática; requiere revisión jurídica.",
    method: "parser",
  },
];

export function getVerifiedRelations(slug: string) {
  return relations.filter((relation) => relation.status === "verified" && (relation.sourceSlug === slug || relation.targetSlug === slug));
}

export function getAllRelations() {
  return relations;
}

export async function getReviewRelations() {
  if (!process.env.DATABASE_URL) return relations;
  const db = getDb();
  const rows = await db.select().from(legalRelations);
  const result: LegalRelation[] = [];
  for (const row of rows) {
    const [source] = await db.select({ slug: norms.slug, label: norms.shortTitle })
      .from(norms).where(eq(norms.id, row.sourceNormId)).limit(1);
    const [target] = await db.select({ slug: norms.slug, label: norms.shortTitle })
      .from(norms).where(eq(norms.id, row.targetNormId)).limit(1);
    if (!source || !target) continue;
    result.push({
      id: row.id,
      sourceSlug: source.slug,
      sourceLabel: source.label,
      targetSlug: target.slug,
      targetLabel: target.label,
      type: row.type,
      status: row.status,
      evidence: row.evidence,
      method: row.method === "manual" || row.method === "parser" || row.method === "import" ? row.method : "import",
    });
  }
  return result;
}
