import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseBcnNorm } from "@/ingestion/sources/bcn-leychile/parser";

describe("BCN LeyChile staging parser", () => {
  it("normalizes nested article nodes and keeps provenance", async () => {
    const raw = await readFile("tests/fixtures/bcn-leychile-response.json", "utf8");
    const snapshot = parseBcnNorm(raw, {
      normId: "210676",
      slug: "ley-19880",
      number: "19.880",
      title: "Ley de prueba BCN",
      publishedAt: "2003-05-29T00:00:00.000Z",
      sourceUrl: "https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?idNorma=210676",
      capturedAt: "2026-09-18T00:00:00.000Z",
    });

    expect(snapshot.source.name).toBe("BCN LeyChile");
    expect(snapshot.source.checksum).toHaveLength(64);
    expect(snapshot.articles).toHaveLength(2);
    expect(snapshot.articles[0]).toMatchObject({
      id: "articulo-1",
      number: "1°",
      title: "Ámbito de aplicación",
      sourcePartId: 101,
      sourceFlags: ["MODIFICACION"],
    });
    expect(snapshot.articles[0].paragraphs[0]).toContain("La presente ley establece");
  });

  it("rejects a response without articles", () => {
    expect(() => parseBcnNorm(JSON.stringify({ html: [{ t: "<div>Sin artículos</div>" }] }), {
      normId: "210676",
      slug: "ley-19880",
      number: "19.880",
      title: "Ley de prueba BCN",
      publishedAt: "2003-05-29T00:00:00.000Z",
      sourceUrl: "https://example.com",
      capturedAt: "2026-09-18T00:00:00.000Z",
    })).toThrow("recognizable articles");
  });
});
