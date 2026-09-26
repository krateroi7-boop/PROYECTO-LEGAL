import { searchQuerySchema } from "@/api/contracts";
import { apiFailure, apiJson, apiStatusForError, requireDatabase } from "@/api/http";
import { enforceRateLimit } from "@/api/rate-limit";
import { listApiNormsPage } from "@/db/repositories/api";

export async function GET(request: Request) {
  try {
    requireDatabase();
    enforceRateLimit(request);
    const query = searchQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await listApiNormsPage(query.page, query.limit);
    return apiJson(result.items, {
      headers: { "cache-control": "public, max-age=60" },
    }, { page: query.page, limit: query.limit, hasNext: result.hasNext });
  } catch (error) {
    return apiFailure(error, apiStatusForError(error));
  }
}
