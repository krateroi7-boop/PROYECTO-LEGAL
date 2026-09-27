import { z } from "zod";

const importMetadataSchema = z.object({
  normId: z.string().regex(/^\d+$/),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  type: z.string().trim().min(1),
  number: z.string().trim().min(1),
  title: z.string().trim().min(1),
  status: z.enum(["vigente", "modificada", "derogada", "desconocida"]).default("desconocida"),
  publishedAt: z.string().datetime(),
  versionDate: z.string().datetime().optional(),
  validFrom: z.string().datetime().optional(),
  sourceUrl: z.string().url(),
  capturedAt: z.string().datetime(),
});

export function validateBcnImportMetadata(value: unknown) {
  const result = importMetadataSchema.safeParse(value);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`BCN import requires explicit, valid metadata: ${fields.join(", ")}. No publication date, type or legal status is inferred.`);
  }
  return result.data;
}
