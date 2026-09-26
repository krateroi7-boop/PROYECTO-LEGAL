import { publicIdSchema, publicSlugSchema } from "@/api/contracts";
import { apiFailure, apiJson, requireDatabase } from "@/api/http";
import { getApiNormDetail } from "@/db/repositories/api";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ slug: string; versionId: string }> },
) {
  try {
    requireDatabase();
    const parsed = await params;
    const slug = publicSlugSchema.parse(parsed.slug);
    const versionId = publicIdSchema.parse(parsed.versionId);
    const norm = await getApiNormDetail(slug, versionId);
    if (!norm) return apiFailure(new Error("Norm not found"), 404);
    return apiJson(norm, { headers: { "cache-control": "public, max-age=60" } });
  } catch (error) {
    return apiFailure(error, error instanceof Error && error.message === "DATABASE_UNAVAILABLE" ? 503 : 400);
  }
}
