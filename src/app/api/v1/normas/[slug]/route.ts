import { publicSlugSchema } from "@/api/contracts";
import { apiFailure, apiJsonWithEtag, requireDatabase } from "@/api/http";
import { getApiNormDetail } from "@/db/repositories/api";
import { enforceRateLimit } from "@/api/rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    requireDatabase();
    enforceRateLimit(request);
    const slug = publicSlugSchema.parse((await params).slug);
    const norm = await getApiNormDetail(slug);
    if (!norm) return apiFailure(new Error("Norm not found"), 404);
    return apiJsonWithEtag(request, norm, { headers: { "cache-control": "private, no-cache, must-revalidate" } });
  } catch (error) {
    return apiFailure(error, error instanceof Error && error.message === "DATABASE_UNAVAILABLE" ? 503 : 400);
  }
}
