import { publicSlugSchema } from "@/api/contracts";
import { apiFailure, apiJson, requireDatabase } from "@/api/http";
import { listApiVersions } from "@/db/repositories/api";
import { enforceRateLimit } from "@/api/rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    requireDatabase();
    enforceRateLimit(request);
    const slug = publicSlugSchema.parse((await params).slug);
    const versions = await listApiVersions(slug);
    if (!versions) return apiFailure(new Error("Norm not found"), 404);
    return apiJson(versions, { headers: { "cache-control": "private, no-cache, must-revalidate" } });
  } catch (error) {
    return apiFailure(error, error instanceof Error && error.message === "DATABASE_UNAVAILABLE" ? 503 : 400);
  }
}
