import { z } from "zod";
import { apiFailure, apiJson, requireDatabase } from "@/api/http";
import { enforceRateLimit } from "@/api/rate-limit";
import { discoverBcn } from "@/sources/discovery";

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, { limit: 30 });
    const query = z.string().trim().min(1).max(500).parse(new URL(request.url).searchParams.get("q"));
    if (process.env.BCN_DISCOVERY_ENABLED !== "true") return apiJson({ status: "unavailable", candidates: [], cache: "none", reason: "disabled" }, { headers: { "Cache-Control": "no-store" } });
    requireDatabase();
    const result = await discoverBcn(query);
    return apiJson(result, { status: result.status === "in_progress" ? 202 : result.status === "unavailable" ? 503 : 200, headers: { "Cache-Control": "no-store", ...(result.retryAfterSeconds ? { "Retry-After": String(result.retryAfterSeconds) } : {}) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return apiFailure(error, error instanceof z.ZodError || message === "INVALID_DISCOVERY_QUERY" ? 400 : message === "RATE_LIMITED" ? 429 : message === "DATABASE_UNAVAILABLE" ? 503 : 500);
  }
}
