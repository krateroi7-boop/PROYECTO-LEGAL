import { describe, expect, it } from "vitest";
import { validateBcnImportMetadata } from "@/ingestion/sources/bcn-leychile/metadata";

const metadata = {
  normId: "123", slug: "ley-123", type: "Ley", number: "123", title: "Norma de prueba",
  publishedAt: "2003-05-29T00:00:00.000Z", sourceUrl: "https://example.test/norma",
  capturedAt: "2026-09-18T00:00:00.000Z",
};

describe("BCN import metadata", () => {
  it("leaves legal commencement and source version unknown when only publication is known", () => {
    const result = validateBcnImportMetadata(metadata);
    expect(result.status).toBe("desconocida");
    expect(result.validFrom).toBeUndefined();
    expect(result.versionDate).toBeUndefined();
  });

  it.each(["type", "publishedAt", "title", "number"])("requires explicit %s instead of fabricating it", (field) => {
    expect(() => validateBcnImportMetadata({ ...metadata, [field]: undefined })).toThrow(field);
  });
});
