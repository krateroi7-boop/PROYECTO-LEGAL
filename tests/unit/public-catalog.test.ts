import { describe, expect, it } from "vitest";
import { publicCorpus } from "@/sources/corpus";
import { attachCatalogPublications, catalogName, matchingCatalog } from "@/lib/catalog-presentation";
import { getPublicCatalog } from "@/lib/public-catalog";
import { afterEach, vi } from "vitest";
afterEach(() => vi.unstubAllEnvs());
describe("editorial library and verified reading availability", () => {
  it("offers the actual priority selection without fixtures or fictitious reader links in production without DB", async () => {
    vi.stubEnv("LEGISDATA_DATA_MODE", "production"); vi.stubEnv("DATABASE_URL", "");
    const entries = await getPublicCatalog();
    expect(entries.slice(0, 4).map((e) => e.name)).toEqual(["Código Civil", "Código de Procedimiento Civil", "Código Penal", "Código del Trabajo"]);
    expect(entries).toHaveLength(6); expect(entries.every((e) => !e.readerSlug)).toBe(true);
    expect(entries.some((e) => e.name === "Ley 19.628")).toBe(false);
  });
  it("matches accents and common names without treating the long official title as the UX name", () => {
    expect(matchingCatalog(publicCorpus, "codigo civil").map((e) => e.name)).toEqual(["Código Civil"]);
    expect(catalogName("bcn-leychile", "172986")).toBe("Código Civil");
    expect(catalogName("bcn-leychile", "1054426")).toBeUndefined();
    expect(catalogName("other-source", "172986")).toBeUndefined();
  });
  it("attaches direct readers only by authorized source identity; a planned slug or similar number is insufficient", () => {
    const published = attachCatalogPublications(publicCorpus, [{ source: "bcn-leychile", externalId: "172986", slug: "preserved-code-slug" }]);
    expect(published[0].readerSlug).toBe("preserved-code-slug");
    expect(published[1].readerSlug).toBeUndefined();
    expect(attachCatalogPublications(published, [])[0].readerSlug).toBeUndefined();
    expect(attachCatalogPublications(publicCorpus, [{ source: "other-source", externalId: "172986", slug: "unverified" }])[0].readerSlug).toBeUndefined();
  });
});
