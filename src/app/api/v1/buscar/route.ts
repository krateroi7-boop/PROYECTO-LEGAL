import { searchQuerySchema, searchResultDtoSchema } from "@/api/contracts";
import { apiFailure, apiJsonWithEtag, apiStatusForError, requireDatabase } from "@/api/http";
import { enforceRateLimit } from "@/api/rate-limit";
import { searchPersisted } from "@/db/repositories/search";

export async function GET(request: Request) {
  try {
    requireDatabase();
    enforceRateLimit(request);
    const query = searchQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const results = await searchPersisted({ ...query, offset: (query.page - 1) * query.limit });
    const validResults = results.map((result) => searchResultDtoSchema.parse({
      ...result,
      node: result.node ?? null,
    }));
    return apiJsonWithEtag(request, validResults, { headers: { "cache-control": "public, max-age=30" } }, {
      page: query.page,
      limit: query.limit,
      hasNext: validResults.length === query.limit,
    });
  } catch (error) {
    return apiFailure(error, apiStatusForError(error));
  }
}
