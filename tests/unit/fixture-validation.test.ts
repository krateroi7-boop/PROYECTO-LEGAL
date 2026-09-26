import { describe, expect, it } from "vitest";
import { validateFixture } from "@/domain/legislation/validate";

const fixture = {
  schemaVersion: 1,
  source: { name: "Fuente de prueba", capturedAt: "2026-01-01T00:00:00.000Z" },
  laws: [{
    slug: "ley-prueba",
    type: "Ley",
    number: "1",
    title: "Ley de prueba",
    shortTitle: "Prueba",
    status: "Vigente",
    published: "1 de enero de 2026",
    updated: "Última modificación: 1 de enero de 2026",
    description: "Descripción de prueba",
    topics: ["Prueba"],
    articles: [{ id: "articulo-1", number: "1°", paragraphs: ["Texto"] }],
  }],
};

describe("validateFixture", () => {
  it("accepts a valid structured fixture", () => {
    expect(validateFixture(fixture).laws).toHaveLength(1);
  });

  it("rejects duplicate law numbers and non-contiguous articles", () => {
    expect(() => validateFixture({
      ...fixture,
      laws: [fixture.laws[0], { ...fixture.laws[0], slug: "otra-ley" }],
    })).toThrow("Duplicate norm number");
    expect(() => validateFixture({
      ...fixture,
      laws: [{ ...fixture.laws[0], articles: [{ ...fixture.laws[0].articles[0], id: "articulo-2" }] }],
    })).toThrow("contiguous");
  });
});
