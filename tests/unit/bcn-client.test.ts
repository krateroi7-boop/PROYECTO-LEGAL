import { describe, expect, it } from "vitest";
import { fetchBcnNorm, resetBcnRequestBudget } from "@/ingestion/sources/bcn-leychile/client";

describe("BCN client", () => {
  it("validates identifiers and captures raw JSON with checksum", async () => {
    resetBcnRequestBudget();
    const result = await fetchBcnNorm("123", {
      fetchImpl: async () => new Response('{"html":[]}', { status: 200 }),
      now: () => 1_000_000,
    });
    expect(result.sourceIdentifier).toBe("123");
    expect(result.checksum).toHaveLength(64);
    expect(result.httpStatus).toBe(200);
  });

  it("rejects invalid JSON", async () => {
    resetBcnRequestBudget();
    await expect(fetchBcnNorm("123", {
      fetchImpl: async () => new Response("no-json", { status: 200 }),
      now: () => 2_000_000,
    })).rejects.toThrow("not valid JSON");
  });
});
