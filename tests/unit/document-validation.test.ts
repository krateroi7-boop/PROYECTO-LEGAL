import { describe, expect, it } from "vitest";
import { completeXml, syntheticDocument } from "../helpers/complete-xml";
import { validateSourceDocument } from "@/sources/document-validation";
import { searchFragments } from "@/search/indexing";
import { safeContentUrl } from "@/domain/legislation/content";
import { automaticPublicationAllowed, COMMERCIAL_FULLTEXT_SCOPE } from "@/ingestion/editorial/source-policy";
describe("complete source representation", () => {
  it("compares independent XML coverage and preserves structural metadata", () => {
    const doc = syntheticDocument();
    expect(validateSourceDocument(doc).complete).toBe(true);
    expect(doc.coverage).toMatchObject({ inputParts: 7, representedParts: 7, inputTexts: 7, representedTexts: 7, unsupported: [] });
    expect(doc.nodes[2].sourceMetadata?.idParte).toBe("11");
    doc.nodes.pop(); expect(validateSourceDocument(doc).complete).toBe(false);
  });
  it("preserves mixed order, lists, cells, emphasis and safe links", () => {
    const xml = completeXml.replace("Vistos: antecedentes exclusivamente ficticios.", 'Antes <em>énfasis</em><ol><li>Primero</li><li>Segundo</li></ol><table><tr><td>Diez</td><td>Veinte</td></tr></table><a href="https://example.test/norma">fuente</a><sup>2</sup>');
    const doc = syntheticDocument(xml);
    expect(doc.nodes[0].text).toContain("Primero\n\nSegundo");
    expect(doc.nodes[0].text).toContain("Diez\tVeinte");
    expect(doc.nodes[0].text).not.toContain("PrimeroSegundo");
    expect(validateSourceDocument(doc).complete).toBe(true);
  });
  it.each(['<img alt="fórmula"/>', '<desconocido/>', '<a href="javascript:alert(1)">texto</a>', '<ol start="5"><li>Regla</li></ol>']) ("blocks unsupported content %s rather than silently publishing", (content) => {
    const doc = syntheticDocument(completeXml.replace("Vistos: antecedentes exclusivamente ficticios.", content));
    expect(validateSourceDocument(doc).issues).toContainEqual(expect.objectContaining({ rule: "unsupported-content", severity: "error" }));
  });
  it("rejects cycles, identity mismatches, missing dates and unexplained removal", () => {
    const doc = syntheticDocument(); doc.nodes[0].parentStableKey = doc.nodes[2].stableKey;
    expect(validateSourceDocument(doc).complete).toBe(false);
    expect(validateSourceDocument(syntheticDocument(), { kind: "idNorma", value: "999" }).complete).toBe(false);
    const missing = syntheticDocument(); missing.versionDate = null;
    expect(validateSourceDocument(missing).complete).toBe(false);
    const previous = syntheticDocument(); previous.nodes.push({ ...previous.nodes[0], stableKey: "removed" });
    expect(validateSourceDocument(syntheticDocument(), undefined, previous).issues).toContainEqual(expect.objectContaining({ rule: "removed-structures" }));
  });
  it("preserves the real BCN future-date pattern but requires editorial review", () => {
    const doc = syntheticDocument(completeXml.replace('fechaVersion="2024-03-15"', 'fechaVersion="2222-02-02"'));
    expect(doc.versionDate).toBe("2222-02-02");
    expect(validateSourceDocument(doc).issues).toContainEqual(expect.objectContaining({ rule: "future-source-version-date", severity: "warning" }));
  });
  it("fragments the search projection without losing Unicode text", () => {
    const text = "regla á😀 ".repeat(9000);
    const fragments = searchFragments(text);
    expect(fragments.length).toBeGreaterThan(1); expect(fragments.join("")).toBe(text);
    expect(fragments.every((fragment) => fragment.length <= 16_000)).toBe(true);
    expect(safeContentUrl("data:text/html,example")).toBeUndefined();
  });
  it("auto publication needs scope, approved parser and independent policy", () => {
    const source = { sourceKey: "synthetic", sourceName: "Synthetic", parser: "bcn-leychile-xml-v3" };
    const policy = { publicationAllowed: true, publicationMode: "auto_publish_validated" as const, usageScope: COMMERCIAL_FULLTEXT_SCOPE, reviewedBy: "reviewer", reviewedAt: new Date("2020-01-01"), evidenceUrl: "https://example.test/terms" };
    expect(automaticPublicationAllowed(source, policy)).toBe(true);
    expect(automaticPublicationAllowed(source, { ...policy, usageScope: "metadata" })).toBe(false);
    expect(automaticPublicationAllowed({ ...source, parser: "bcn-leychile-json-v2" }, policy)).toBe(false);
    expect(automaticPublicationAllowed(source, { ...policy, publicationAllowed: false })).toBe(false);
  });
});
