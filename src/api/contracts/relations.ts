import { z } from "zod";
import { publicIdSchema, publicSlugSchema, stableKeySchema } from "./ids";

export const relationTypeSchema = z.enum(["modifica", "deroga", "reemplaza", "cita", "remite", "reglamenta", "complementa", "relacionada"]);
export const relationStatusSchema = z.enum(["pending", "verified", "rejected"]);

export const relationEndpointSchema = z.object({
  normSlug: publicSlugSchema,
  stableKey: stableKeySchema.optional(),
});

export const relationDtoSchema = z.object({
  id: publicIdSchema,
  source: relationEndpointSchema,
  target: relationEndpointSchema,
  type: relationTypeSchema,
  status: relationStatusSchema,
  evidence: z.string().min(1),
  evidenceFragment: z.string().min(1).optional(),
  method: z.enum(["manual", "parser", "import"]),
  provenance: z.object({
    sourceDocumentId: publicIdSchema.optional(),
    capturedAt: z.string().datetime().optional(),
  }).optional(),
});

export type RelationDto = z.infer<typeof relationDtoSchema>;
