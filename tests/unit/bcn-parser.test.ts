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
      id: "bcn-parte-101",
      number: "1°",
      title: "Ámbito de aplicación",
      sourcePartId: 101,
      sourceFlags: ["MODIFICACION"],
    });
    expect(snapshot.articles[0].paragraphs[0]).toContain("La presente ley establece");
  });

  const metadata = {
    normId: "210676", slug: "ley-19880", number: "19.880", title: "Ley de prueba",
    publishedAt: "2003-05-29T00:00:00.000Z", sourceUrl: "https://example.test/norma",
    capturedAt: "2026-09-18T00:00:00.000Z",
  };

  it("recognizes unique and bis articles and preserves encoded legal comparisons", () => {
    const snapshot = parseBcnNorm(JSON.stringify({ html: [
      { i: 10, t: '<div class="p">Art&iacute;culo &uacute;nico. Regla. a &lt; b &gt; c; &amp;lt;literal&amp;gt; &#x3e; &#62;.</div>' },
      { i: 20, t: '<div class="p">Artículo 2 bis. Efecto. Se aplica la regla adicional.</div>' },
    ] }), metadata);
    expect(snapshot.articles.map((article) => article.number)).toEqual(["único", "2 bis"]);
    expect(snapshot.articles[0].paragraphs).toEqual(["a < b > c; &lt;literal&gt; > >."]);
  });

  it("keeps identifiers when an article is inserted before an existing source part", () => {
    const original = { i: 101, t: '<div class="p">Artículo 2°. Regla. Texto original.</div>' };
    const before = parseBcnNorm(JSON.stringify({ html: [original] }), metadata);
    const after = parseBcnNorm(JSON.stringify({ html: [
      { i: 102, t: '<div class="p">Artículo 1°. Inicio. Artículo añadido.</div>' }, original,
    ] }), metadata);
    expect(before.articles[0].id).toBe(after.articles[1].id);
    expect(after.articles[1].id).toBe("bcn-parte-101");
  });

  it("uses labels when a source part ID is absent and rejects ambiguous repeated labels", () => {
    const article = { t: '<div class="p">Artículo 2 ter. Regla. Texto.</div>' };
    expect(parseBcnNorm(JSON.stringify({ html: [article] }), metadata).articles[0].id).toBe("articulo-2-ter");
    expect(() => parseBcnNorm(JSON.stringify({ html: [article, article] }), metadata)).toThrow("ambiguous or duplicate");
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
