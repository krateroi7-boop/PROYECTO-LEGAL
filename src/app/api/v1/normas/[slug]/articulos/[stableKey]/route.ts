import { publicSlugSchema, stableKeySchema } from "@/api/contracts";
import { apiFailure, apiJsonWithEtag, requireDatabase } from "@/api/http";
import { getApiArticle } from "@/db/repositories/api";
import { enforceRateLimit } from "@/api/rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; stableKey: string }> }) {
  try {
    requireDatabase();
    enforceRateLimit(request);
    const parsed = await params;
    const slug = publicSlugSchema.parse(parsed.slug);
    const stableKey = stableKeySchema.parse(parsed.stableKey);
    const article = await getApiArticle(slug, stableKey);
    if (!article) return apiFailure(new Error("Article not found"), 404);
    return apiJsonWithEtag(request, article, { headers: { "cache-control": "public, max-age=60" } });
  } catch (error) {
    return apiFailure(error, error instanceof Error && error.message === "DATABASE_UNAVAILABLE" ? 503 : 400);
  }
}
