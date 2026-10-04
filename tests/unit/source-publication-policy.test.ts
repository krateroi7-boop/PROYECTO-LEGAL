import { describe, expect, it } from "vitest";
import { publicationSourceKey, sourcePublicationAllowed } from "@/ingestion/editorial/source-policy";

const source = { sourceKey: "bcn-leychile", sourceName: "BCN LeyChile", parser: "bcn-leychile-xml-v3" };
const policy = { publicationAllowed: true, evidenceUrl: "https://example.test/terms", reviewedAt: new Date("2020-01-01"), reviewedBy: "reviewer" };

describe("independent source usage approval", () => {
  it("blocks unreviewed sources even when an editorial approval exists", () => {
    expect(sourcePublicationAllowed(source)).toBe(false);
    expect(sourcePublicationAllowed(source, { ...policy, publicationAllowed: false })).toBe(false);
    expect(sourcePublicationAllowed(source, { ...policy, reviewedBy: null })).toBe(false);
    expect(sourcePublicationAllowed(source, { ...policy, reviewedAt: null })).toBe(false);
    expect(sourcePublicationAllowed(source, { ...policy, evidenceUrl: "javascript:alert(1)" })).toBe(false);
    expect(sourcePublicationAllowed(source, policy)).toBe(true);
    expect(sourcePublicationAllowed({ ...source, parser: "bcn-leychile-json-v2" }, policy)).toBe(false);
  });

  it("recognizes legacy BCN provenance and allows only explicit local fixture provenance without a source key", () => {
    expect(publicationSourceKey({ ...source, sourceKey: null })).toBe("bcn-leychile");
    expect(sourcePublicationAllowed({ sourceKey: null, sourceName: "Unknown", parser: "some-parser" })).toBe(false);
    expect(sourcePublicationAllowed({ sourceKey: null, sourceName: "Demo fixture", parser: "local-fixture-v1" })).toBe(true);
  });
});
