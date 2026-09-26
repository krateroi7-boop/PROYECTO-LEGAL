import { z } from "zod";
import { publicIdSchema, publicSlugSchema, stableKeySchema } from "./ids";
import { provenanceSchema } from "./provenance";

export const normStatusSchema = z.enum(["vigente", "modificada", "derogada"]);
export const nodeTypeSchema = z.enum(["titulo", "capitulo", "parrafo", "articulo", "inciso", "disposicion_transitoria"]);

export const articleDtoSchema = z.object({
  id: publicIdSchema.optional(),
  stableKey: stableKeySchema,
  type: nodeTypeSchema,
  label: z.string().min(1),
  title: z.string().nullable(),
  text: z.string(),
  position: z.number().int().nonnegative(),
  parentStableKey: stableKeySchema.nullable(),
});

export const versionDtoSchema = z.object({
  id: publicIdSchema,
  label: z.string().min(1),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().nullable(),
  isCurrent: z.boolean(),
  provenance: provenanceSchema.optional(),
});

export const normSummaryDtoSchema = z.object({
  id: publicIdSchema.optional(),
  slug: publicSlugSchema,
  type: z.string().min(1),
  number: z.string().min(1),
  title: z.string().min(1),
  shortTitle: z.string().min(1),
  description: z.string(),
  status: normStatusSchema,
  topics: z.array(z.string()),
  publishedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const normDetailDtoSchema = normSummaryDtoSchema.extend({
  currentVersion: versionDtoSchema.nullable(),
  articles: z.array(articleDtoSchema),
  provenance: provenanceSchema.optional(),
});

export type ArticleDto = z.infer<typeof articleDtoSchema>;
export type VersionDto = z.infer<typeof versionDtoSchema>;
export type NormSummaryDto = z.infer<typeof normSummaryDtoSchema>;
export type NormDetailDto = z.infer<typeof normDetailDtoSchema>;
