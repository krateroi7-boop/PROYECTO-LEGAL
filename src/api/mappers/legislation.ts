import type { ArticleDto, NormDetailDto, NormSummaryDto, ProvenanceDto, VersionDto } from "@/api/contracts";
import type { Law } from "@/lib/legislation";

export function mapLawToSummary(law: Law): NormSummaryDto {
  return {
    slug: law.slug,
    type: law.type,
    number: law.number,
    title: law.title,
    shortTitle: law.shortTitle,
    description: law.description,
    status: ({ Vigente: "vigente", Modificada: "modificada", Derogada: "derogada", Desconocida: "desconocida" } as const)[law.status],
    topics: law.topics,
    publishedAt: new Date(law.published).toISOString(),
    updatedAt: new Date(law.updated.replace("Última modificación: ", "")).toISOString(),
  };
}

export function mapLawToDetail(law: Law): NormDetailDto {
  return {
    ...mapLawToSummary(law),
    currentVersion: null,
    articles: law.articles.map((article, position): ArticleDto => ({
      stableKey: article.id,
      type: "articulo",
      label: `Artículo ${article.number}`,
      title: article.title ?? null,
      text: article.paragraphs.join("\n\n"),
      position,
      parentStableKey: null,
    })),
  };
}

export function mapProvenance(input: {
  id?: string;
  sourceName: string;
  sourceUrl?: string | null;
  checksum: string;
  parser: string;
  capturedAt: Date;
}): ProvenanceDto {
  return {
    sourceDocumentId: input.id,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl ?? undefined,
    checksum: input.checksum,
    parser: input.parser,
    capturedAt: input.capturedAt.toISOString(),
  };
}

export function mapVersion(input: {
  id: string;
  versionLabel: string;
  validFrom: Date | null;
  sourceVersionDate?: Date | null;
  validTo: Date | null;
  isCurrent: boolean;
  provenance?: ProvenanceDto;
}): VersionDto {
  return {
    id: input.id,
    label: input.versionLabel,
    validFrom: input.validFrom?.toISOString() ?? null,
    sourceVersionDate: input.sourceVersionDate?.toISOString() ?? null,
    validTo: input.validTo?.toISOString() ?? null,
    isCurrent: input.isCurrent,
    provenance: input.provenance,
  };
}
