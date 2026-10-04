import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBcnXml, BCN_XML_PARSER_VERSION } from "@/ingestion/sources/bcn-leychile/xml-parser";
import { BcnXmlError } from "@/ingestion/sources/bcn-leychile/xml-client";
import { parseBcnReference, bcnReferenceKey } from "@/ingestion/sources/bcn-leychile/reference";

const raw = readFileSync("tests/fixtures/bcn-xml-synthetic.xml", "utf8");
const capture = { url: "https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma=987654", capturedAt: "2026-09-26T12:00:00.000Z" };

describe("BCN XML normalization", () => {
  it("reads TituloNorma and decimal/hexadecimal XML character references seen in real captures", () => {
    const sample = raw.replaceAll("<Titulo>", "<TituloNorma>").replaceAll("</Titulo>", "</TituloNorma>").replace("Órgano ficticio de pruebas", "&#211;rgano ficticio de pruebas &#xCD;");
    const document = parseBcnXml(sample, capture);
    expect(document.identity.title).toBe(parseBcnXml(raw, capture).identity.title);
    expect(document.identity.organisms).toEqual(["Órgano ficticio de pruebas Í"]);
    expect(document.warnings).not.toContain("missing-title");
    expect(document.source.parser).toBe(BCN_XML_PARSER_VERSION);
  });
  it("preserves source identity, declared dates, type and legal-status uncertainty", () => {
    const document = parseBcnXml(raw, capture);
    expect(document.identity).toMatchObject({ sourceIdentifier: "987654", type: "Decreto", number: "001", publishedAt: "2020-02-29", versionDate: "2024-03-15", status: "unknown", sourceStatus: "no derogado", organisms: ["Órgano ficticio de pruebas"] });
    expect(document.source).toMatchObject({ ...capture, parser: BCN_XML_PARSER_VERSION, sourceIdentifier: "987654" });
    expect(document.source.checksum).toHaveLength(64);
  });

  it("retains hierarchy, unique/bis/transitory articles, headings, promulgation and annexes", () => {
    const document = parseBcnXml(raw, capture);
    expect(document.nodes.map((node) => node.type)).toEqual(["encabezado", "capitulo", "articulo", "articulo", "disposicion_transitoria", "promulgacion", "anexo"]);
    const unique = document.nodes.find((node) => node.sourcePartId === "11")!;
    expect(unique).toMatchObject({ stableKey: "bcn-987654-parte-11", parentStableKey: "bcn-987654-parte-10", label: "Artículo único", title: null });
    expect(unique.text).toContain("A > B y C < D");
    expect(unique.text).toContain("& su contexto");
    expect(document.nodes.find((node) => node.sourcePartId === "12")).toMatchObject({ label: "Artículo 2 bis", text: "Artículo 2 bis. Primera línea.\nSegunda línea con <símbolos literales>." });
    expect(document.nodes.find((node) => node.sourcePartId === "13")).toMatchObject({ label: "Artículo 1 transitorio", transitory: true });
    expect(document.nodes.at(-1)?.text).toBe("Contenido del anexo. [Archivo adjunto: tabla.txt] Fin del anexo.");
    expect(document.attachments).toEqual([{ name: "tabla.txt", mimeType: "text/plain", description: "Adjunto ficticio", embedded: true }]);
    expect(document.warnings).toContain("binary-attachments-require-review");
  });

  it("uses source part IDs even when articles are inserted before existing articles", () => {
    const original = parseBcnXml(raw, capture);
    const added = raw.replace('<EstructuraFuncional idParte="11"', '<EstructuraFuncional idParte="99" tipoParte="Artículo"><Texto>Artículo agregado.</Texto><Metadatos><NombreParte>0</NombreParte></Metadatos></EstructuraFuncional><EstructuraFuncional idParte="11"');
    const updated = parseBcnXml(added, capture);
    expect(updated.nodes.find((node) => node.sourcePartId === "11")?.stableKey).toBe(original.nodes.find((node) => node.sourcePartId === "11")?.stableKey);
    expect(updated.nodes.find((node) => node.sourcePartId === "11")?.position).not.toBe(original.nodes.find((node) => node.sourcePartId === "11")?.position);
  });

  it("does not invent dates and records explicitly declared repeal", () => {
    const edited = raw.replace('fechaPublicacion="2020-02-29"', "").replace('fechaVersion="2024-03-15"', "").replace('derogado="no derogado"', 'derogado="derogado"');
    const document = parseBcnXml(edited, capture);
    expect(document.identity).toMatchObject({ publishedAt: null, versionDate: null, status: "derogada" });
    expect(document.warnings).toEqual(expect.arrayContaining(["missing-publication-date", "missing-version-date"]));
  });

  it("preserves mixed text order and namespace prefixes", () => {
    const mixed = raw.replace("Vistos: antecedentes exclusivamente ficticios.", "Antes <b>texto</b> después.").replace("<Norma ", "<lc:Norma xmlns:lc=\"http://www.leychile.cl/esquemas\" ").replace("</Norma>", "</lc:Norma>");
    expect(parseBcnXml(mixed, capture).nodes[0].text).toBe("Antes texto después.");
  });

  it.each([
    ["malformed XML", raw.replace("</Norma>", "")],
    ["DTD", '<!DOCTYPE Norma [<!ENTITY external SYSTEM "file:///etc/passwd">]>' + raw],
    ["unknown body structure", raw.replace("</Norma>", "<TextoNuevo>Un texto que no puede omitirse</TextoNuevo></Norma>")],
    ["invalid date", raw.replace('fechaPublicacion="2020-02-29"', 'fechaPublicacion="2021-02-29"')],
    ["duplicate identifiers", raw.replace('idParte="12"', 'idParte="11"')],
    ["missing stable part ID", raw.replace('idParte="11"', "")],
    ["duplicate text block", raw.replace("</Texto>", "</Texto><Texto>Este texto no puede omitirse</Texto>")],
    ["missing part type", raw.replace('tipoParte="Capítulo"', "")],
    ["HTML response", "<html><body>Not a document</body></html>"],
  ])("rejects %s without producing a publishable document", (_, value) => {
    expect(() => parseBcnXml(value, capture)).toThrow(BcnXmlError);
  });

  it("checks provenance checksum", () => {
    expect(() => parseBcnXml(raw, { ...capture, checksum: "0".repeat(64) })).toThrow("checksum");
  });
});

describe("BCN reference resolution", () => {
  it.each([
    ["210676", "idNorma", "210676"], ["Ley 19.880", "idLey", "19880"], ["Ley Nº 19880", "idLey", "19880"], ["idNorma:210676", "idNorma", "210676"],
    ["https://www.bcn.cl/leychile/navegar?idNorma=210676", "idNorma", "210676"],
    ["https://www.leychile.cl/Consulta/obtxml?opt=7&idLey=19880", "idLey", "19880"],
  ])("accepts %s", (value, kind, identifier) => {
    expect(parseBcnReference(value)).toEqual({ kind, value: identifier });
    expect(bcnReferenceKey(parseBcnReference(value))).toBe(`${kind}:${identifier}:latest:xml`);
  });

  it.each(["0", "-1", "1.5", "Decreto 1", "Ley 1.2", "https://example.com/?idNorma=1", "https://www.leychile.cl.evil.example/Navegar?idNorma=1", "http://localhost/Navegar?idNorma=1", "https://user:password@www.leychile.cl/Navegar?idNorma=1", "https://www.bcn.cl/leychile/navegar?idNorma=1&idVersion=2020-01-01", "https://www.leychile.cl/Navegar?idNorma=1&idNorma=2", "https://www.leychile.cl/Navegar?idNorma=1&idLey=2"]) ("rejects unsupported or ambiguous reference %s", (value) => {
    expect(() => parseBcnReference(value)).toThrow();
  });
});
