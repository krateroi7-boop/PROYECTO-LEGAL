import { describe, expect, it } from "vitest";
import { citationSchema, normDetailDtoSchema, searchQuerySchema } from "@/api/contracts";

describe("public contracts", () => {
  it("normalizes bounded search pagination", () => {
    expect(searchQuerySchema.parse({ q: "transparencia", page: "2", limit: "10" })).toEqual({
      q: "transparencia",
      page: 2,
      limit: 10,
    });
  });

  it("rejects invalid public slugs", () => {
    expect(() => normDetailDtoSchema.shape.slug.parse("Ley 19.880")).toThrow();
  });

  it("validates traceable future citations", () => {
    expect(citationSchema.parse({
      normSlug: "ley-19880",
      versionId: "00000000-0000-4000-8000-000000000001",
      stableKey: "articulo-1",
      fragment: "Texto citado",
      sourceDocumentId: "00000000-0000-4000-8000-000000000002",
      sourceChecksum: "sha256:demo",
    }).sourceChecksum).toBe("sha256:demo");
  });
});
