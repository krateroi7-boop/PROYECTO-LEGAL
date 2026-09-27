import { z } from "zod";
import { apiFailure, apiJson, apiStatusForError, requireDatabase } from "@/api/http";
import { enforceRateLimit } from "@/api/rate-limit";
import { bcnConnector, resolveBcnDocument } from "@/sources/bcn";

export async function GET(request: Request) {
  try {
    enforceRateLimit(request);
    const input = z.string().trim().min(1).max(500).parse(new URL(request.url).searchParams.get("referencia"));
    const reference = bcnConnector.parseReference(input);
    if (!reference) return apiJson({ status: "invalid_reference", message: "Indique un ID BCN, Ley 19.880 o una URL LeyChile reconocida." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    requireDatabase();
    const result = await resolveBcnDocument(reference);
    const status = { published: 200, pending_review: 202, not_found: 404, unavailable: 503 }[result.status];
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (result.retryAfterSeconds) headers["Retry-After"] = String(result.retryAfterSeconds);
    return apiJson(result, { status, headers }, { coverage: "exact_reference", source: "bcn-leychile" });
  } catch (error) {
    const knownStatus = apiStatusForError(error);
    return apiFailure(error, error instanceof z.ZodError ? 400 : knownStatus === 400 ? 500 : knownStatus);
  }
}
