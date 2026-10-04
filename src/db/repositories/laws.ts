import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { norms, normVersions, normNodes } from "@/db/schema";
import { publicVersionCondition } from "@/db/public-visibility";
import { getApiNormDetail, listApiNorms, listApiVersions } from "@/db/repositories/api";
import { publicIdSchema, type NormDetailDto } from "@/api/contracts";
import type { Law } from "@/lib/legislation";
import type { LawVersion } from "@/domain/versioning/types";

const formatDate = (value: string) => new Date(value).toLocaleDateString("es-CL", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

function toLaw(norm: NormDetailDto): Law {
  const version = norm.currentVersion;
  return {
    slug: norm.slug,
    type: norm.type,
    number: norm.number,
    title: norm.title,
    shortTitle: norm.shortTitle,
    status: ({ vigente: "Vigente", modificada: "Modificada", derogada: "Derogada", desconocida: "Desconocida" } as const)[norm.status],
    published: formatDate(norm.publishedAt),
    updated: version?.sourceVersionDate
      ? `Fecha de versión declarada: ${formatDate(version.sourceVersionDate)}`
      : version?.validFrom ? `Fecha de inicio: ${formatDate(version.validFrom)}` : "Fecha de inicio no informada",
    description: norm.description,
    topics: norm.topics,
    versionId: version?.id,
    provenance: norm.provenance,
    articles: norm.articles.map((node) => ({
      id: node.stableKey,
      number: node.label.replace(/^Artículo\s+/i, ""),
      label: node.label,
      type: node.type,
      title: node.title ?? undefined,
      paragraphs: node.text ? node.text.split("\n\n") : [],
    })),
  };
}

export async function listPersistedLaws(): Promise<Law[]> {
  const summaries = await listApiNorms();
  const laws = await Promise.all(summaries.map((norm) => getPersistedLaw(norm.slug)));
  return laws.filter((law): law is Law => law !== undefined);
}

export async function getPersistedLaw(slug: string, versionId?: string): Promise<Law | undefined> {
  const norm = await getApiNormDetail(slug, versionId);
  return norm ? toLaw(norm) : undefined;
}

export async function getPersistedLawVersion(slug: string, versionId: string): Promise<LawVersion | undefined> {
  if (!publicIdSchema.safeParse(versionId).success) return undefined;
  const norm = await getApiNormDetail(slug, versionId);
  const version = norm?.currentVersion;
  if (!norm || !version) return undefined;
  return {
    id: version.id,
    label: version.label,
    validFrom: version.validFrom ? formatDate(version.validFrom)
      : version.sourceVersionDate ? `Fecha de versión declarada: ${formatDate(version.sourceVersionDate)}` : "Fecha de inicio no informada",
    validTo: version.validTo ? formatDate(version.validTo) : undefined,
    isCurrent: version.isCurrent,
    law: toLaw(norm),
  };
}

export async function listPersistedLawVersions(slug: string): Promise<LawVersion[]> {
  const versions = await listApiVersions(slug);
  if (!versions) return [];
  // The web comparator presents versions chronologically; the API lists newest first.
  const result = await Promise.all([...versions].reverse().map((version) => getPersistedLawVersion(slug, version.id)));
  return result.filter((version): version is LawVersion => version !== undefined);
}

export type LawSummary = Omit<Law, "articles"> & { articleCount: number };
export async function listPersistedLawSummaries(slugs?: string[]): Promise<LawSummary[]> {
  if (slugs?.length === 0) return [];
  const rows = await getDb().select({ norm: norms,
    articleCount: sql<number>`(select count(*)::int from ${normNodes} where ${normNodes.versionId} = ${normVersions.id} and ${normNodes.type} in ('articulo', 'disposicion_transitoria'))`,
  }).from(norms).innerJoin(normVersions, eq(normVersions.normId, norms.id))
    .where(and(eq(normVersions.isCurrent, true), publicVersionCondition(), slugs ? inArray(norms.slug, slugs) : undefined)).orderBy(norms.number).limit(slugs?.length ?? 100);
  return rows.map(({ norm, articleCount }) => ({ slug: norm.slug, type: norm.type, number: norm.number, title: norm.title, shortTitle: norm.shortTitle, description: norm.description, topics: norm.topics,
    status: ({ vigente: "Vigente", modificada: "Modificada", derogada: "Derogada", desconocida: "Desconocida" } as const)[norm.status], published: formatDate(norm.publishedAt.toISOString()), updated: formatDate(norm.updatedAt.toISOString()), articleCount }));
}
