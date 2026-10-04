import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().min(1).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function toApiError(error: unknown): ApiError {
  if (error instanceof Error && ["RATE_LIMITED", "AUTHENTICATION_REQUIRED", "INGESTION_FORBIDDEN"].includes(error.message)) {
    return { code: error.message, message: ({ RATE_LIMITED: "Demasiadas solicitudes. Inténtelo más tarde.", AUTHENTICATION_REQUIRED: "Inicie sesión para incorporar una norma.", INGESTION_FORBIDDEN: "Esta solicitud de incorporación no está autorizada." })[error.message]! };
  }
  if (error instanceof z.ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "La solicitud no es válida.",
      details: { issues: error.issues },
    };
  }
  if (error instanceof Error && error.message === "DATABASE_UNAVAILABLE") {
    return {
      code: "DATABASE_UNAVAILABLE",
      message: "La persistencia no está disponible.",
    };
  }
  if (error instanceof Error && error.message === "Norm not found") {
    return {
      code: "NOT_FOUND",
      message: "La norma solicitada no existe.",
    };
  }
  if (error instanceof Error && error.message === "Article not found") {
    return {
      code: "NOT_FOUND",
      message: "El artículo solicitado no existe.",
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "No fue posible completar la solicitud.",
  };
}
