import { apiJson } from "@/api/http";
import { sourceRegistry } from "@/sources/registry";

export function GET() {
  return apiJson(sourceRegistry, { headers: { "Cache-Control": "no-store" } });
}
