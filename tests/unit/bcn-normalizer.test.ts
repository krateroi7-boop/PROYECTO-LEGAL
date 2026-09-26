import { describe, expect, it } from "vitest";
import { normalizeBcnSnapshot } from "@/ingestion/sources/bcn-leychile/normalizer";
import { validateNormalizedBcnDocument } from "@/ingestion/sources/bcn-leychile/validator";

const snapshot = {
  source: {
    name: "BCN LeyChile" as const,
    url: "https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?idNorma=1",
    capturedAt: "2026-09-19T00:00:00.000Z",
    checksum: "a".repeat(64),
    parser: "bcn-leychile-json-v1" as const,
  },
  norm: {
    normId: "1",
    slug: "ley-demo",
    number: "1",
    title: "Ley demo",
    publishedAt: "2026-09-19T00:00:00.000Z",
    sourceUrl: "https://www.bcn.cl/leychile/navegar?idNorma=1",
    capturedAt: "2026-09-19T00:00:00.000Z",
  },
  articles: [{
    id: "articulo-1",
    number: "1°",
    paragraphs: ["Texto"],
    sourceFlags: ["CONCORDANCIA"],
  }],
};

describe("BCN normalization", () => {
  it("creates a Legisdata document and keeps source references pending", () => {
    const normalized = normalizeBcnSnapshot(snapshot);
    const report = validateNormalizedBcnDocument(normalized);
    expect(normalized.nodes[0]?.type).toBe("articulo");
    expect(normalized.references[0]?.type).toBe("relacionada");
    expect(report.valid).toBe(true);
  });
});
