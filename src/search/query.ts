import { z } from "zod";

export const searchInputSchema = z.object({
  q: z.string().trim().max(200).optional(),
  number: z.string().trim().max(40).optional(),
  article: z.string().trim().max(80).optional(),
  type: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function normalizeSearchInput(input: Record<string, string | undefined>) {
  return searchInputSchema.parse(input);
}
