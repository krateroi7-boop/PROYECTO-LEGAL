import { z } from "zod";
import { publicIdSchema, publicSlugSchema, stableKeySchema } from "./ids";

export const citationSchema = z.object({
  normSlug: publicSlugSchema,
  versionId: publicIdSchema,
  stableKey: stableKeySchema,
  fragment: z.string().min(1),
  sourceDocumentId: publicIdSchema,
  sourceChecksum: z.string().min(1),
});

export type CitationDto = z.infer<typeof citationSchema>;
