import { describe, expect, it } from "vitest";
import { compareVersions } from "@/domain/versioning/compare";
import type { LawVersion } from "@/domain/versioning/types";
import type { Law } from "@/lib/legislation";

const baseLaw: Law = {
  slug: "ley-ejemplo",
  type: "Ley",
  number: "1",
  title: "Ley de ejemplo",
  shortTitle: "Ejemplo",
  status: "Vigente",
  published: "1 de enero de 2020",
  updated: "Última modificación: 1 de enero de 2020",
  description: "Descripción",
  topics: ["Prueba"],
  articles: [
    { id: "articulo-1", number: "1°", paragraphs: ["Texto original"] },
    { id: "articulo-2", number: "2°", paragraphs: ["Se mantiene"] },
  ],
};

const version = (id: string, law: Law): LawVersion => ({
  id,
  label: id,
  validFrom: "2020-01-01",
  isCurrent: id === "new",
  law,
});

describe("compareVersions", () => {
  it("detects added, removed, modified and unchanged articles", () => {
    const next: Law = {
      ...baseLaw,
      articles: [
        { id: "articulo-1", number: "1°", paragraphs: ["Texto modificado"] },
        { id: "articulo-3", number: "3°", paragraphs: ["Nuevo"] },
      ],
    };
    const result = compareVersions(version("old", baseLaw), version("new", next));
    expect(result.summary).toEqual({ added: 1, removed: 1, modified: 1, unchanged: 0 });
  });

  it("rejects versions from different norms", () => {
    expect(() => compareVersions(
      version("old", baseLaw),
      version("other", { ...baseLaw, slug: "otra-ley" }),
    )).toThrow("same norm");
  });
});
