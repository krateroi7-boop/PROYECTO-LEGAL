import { z } from "zod";
import { publicIdSchema } from "./ids";

export const provenanceSchema = z.object({
  sourceDocumentId: publicIdSchema.optional(),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  checksum: z.string().min(1),
  parser: z.string().min(1),
  capturedAt: z.string().datetime(),
});

export type ProvenanceDto = z.infer<typeof provenanceSchema>;
