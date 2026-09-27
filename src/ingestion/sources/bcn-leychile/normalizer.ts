import { z } from "zod";
import type { BcnStagingSnapshot } from "./types";

export const normalizedNodeSchema = z.object({
  stableKey: z.string().min(1),
  type: z.enum(["articulo"]),
  label: z.string().min(1),
  title: z.string().nullable(),
  text: z.string(),
  position: z.number().int().nonnegative(),
  parentStableKey: z.string().nullable(),
  sourcePartId: z.number().int().optional(),
  sourceFlags: z.array(z.string()),
});

export const normalizedLegalDocumentSchema = z.object({
  source: z.object({
    name: z.string(),
    sourceIdentifier: z.string(),
    url: z.string().url(),
    capturedAt: z.string().datetime(),
    checksum: z.string().length(64),
    parser: z.string().min(1),
  }),
  identity: z.object({
    slug: z.string().min(1),
    number: z.string().min(1),
    title: z.string().min(1),
    publishedAt: z.string().datetime(),
  }),
  nodes: z.array(normalizedNodeSchema).min(1),
  references: z.array(z.object({
    sourceStableKey: z.string().min(1),
    type: z.enum(["modifica", "deroga", "reemplaza", "cita", "remite", "relacionada"]),
    evidence: z.string().min(1),
    sourceFlags: z.array(z.string()),
  })),
});

export type NormalizedLegalDocument = z.infer<typeof normalizedLegalDocumentSchema>;

export function normalizeBcnSnapshot(snapshot: BcnStagingSnapshot): NormalizedLegalDocument {
  return normalizedLegalDocumentSchema.parse({
    source: {
      name: snapshot.source.name,
      sourceIdentifier: snapshot.norm.normId,
      url: snapshot.source.url,
      capturedAt: snapshot.source.capturedAt,
      checksum: snapshot.source.checksum,
      parser: snapshot.source.parser,
    },
    identity: {
      slug: snapshot.norm.slug,
      number: snapshot.norm.number,
      title: snapshot.norm.title,
      publishedAt: snapshot.norm.publishedAt,
    },
    nodes: snapshot.articles.map((article, position) => ({
      stableKey: article.id,
      type: "articulo" as const,
      label: `Artículo ${article.number}`,
      title: article.title ?? null,
      text: article.paragraphs.join("\n\n"),
      position,
      parentStableKey: null,
      sourcePartId: article.sourcePartId,
      sourceFlags: article.sourceFlags,
    })),
    references: snapshot.articles.flatMap((article) =>
      article.sourceFlags
        .filter((flag) => ["MODIFICACION", "CONCORDANCIA"].includes(flag))
        .map((flag) => ({
          sourceStableKey: article.id,
          // Source display flags alone do not establish a legal relation or its direction.
          type: "relacionada" as const,
          evidence: `BCN flag: ${flag}; legal relation not determined.`,
          sourceFlags: article.sourceFlags,
        })),
    ),
  });
}
