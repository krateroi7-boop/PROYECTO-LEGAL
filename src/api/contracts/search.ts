import { z } from "zod";
import { publicSlugSchema, stableKeySchema } from "./ids";

export const searchQuerySchema = z.object({
  q: z.string().trim().max(500).optional(),
  number: z.string().trim().max(100).optional(),
  article: z.string().trim().max(200).optional(),
  type: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchResultDtoSchema = z.object({
  norm: z.object({
    slug: publicSlugSchema,
    number: z.string().min(1),
    title: z.string().min(1),
    type: z.string().min(1),
  }),
  node: z.object({
    stableKey: stableKeySchema,
    label: z.string().min(1),
  }).nullable(),
  versionId: z.string().uuid(),
  highlight: z.string(),
  rank: z.number(),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchResultDto = z.infer<typeof searchResultDtoSchema>;
