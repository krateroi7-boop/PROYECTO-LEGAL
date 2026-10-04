import { parseContent, contentText, type ContentBlock } from "@/domain/legislation/content";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { BcnXmlError, validateBcnXmlPayload } from "./xml-client";

export const BCN_XML_PARSER_VERSION = "bcn-leychile-xml-v3";

export type BcnXmlNode = {
  contentBlocks?: ContentBlock[];
  sourceMetadata?: Record<string, string | boolean | null>;
  stableKey: string;
  type: "titulo" | "capitulo" | "parrafo" | "articulo" | "inciso" | "disposicion_transitoria" | "encabezado" | "promulgacion" | "anexo" | "agrupador";
  sourceType: string;
  label: string;
  title: string | null;
  text: string;
  position: number;
  parentStableKey: string | null;
  sourcePartId: string | null;
  versionDate: string | null;
  sourceStatus: string | null;
  transitory: boolean;
};

export type BcnXmlAttachment = {
  name: string | null;
  mimeType: string | null;
  description: string | null;
  embedded: boolean;
};

export type BcnXmlDocument = {
  source: {
    name: "BCN LeyChile";
    sourceIdentifier: string;
    url: string;
    capturedAt: string;
    checksum: string;
    parser: typeof BCN_XML_PARSER_VERSION;
  };
  identity: {
    sourceIdentifier: string;
    type: string;
    number: string;
    identifiers: { type: string; number: string }[];
    title: string;
    publishedAt: string | null;
    promulgatedAt: string | null;
    versionDate: string | null;
    status: "unknown" | "derogada";
    sourceStatus: string | null;
    organisms: string[];
  };
  nodes: BcnXmlNode[];
  attachments: BcnXmlAttachment[];
  coverage: { inputParts: number; representedParts: number; inputTexts: number; representedTexts: number; unsupported: string[] };
  sourceMetadata: Record<string, unknown>;
  warnings: string[];
};

type Element = { name: string; attributes: Record<string, string>; content: (Element | string)[] };
type OrderedXml = Record<string, unknown>[];

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  cdataPropName: "#cdata",
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: true,
  htmlEntities: true,
});

function elements(element: Element, name?: string): Element[] {
  return element.content.filter((part): part is Element => typeof part !== "string" && (!name || part.name === name));
}

function child(element: Element | undefined, name: string): Element | undefined {
  return element ? elements(element, name)[0] : undefined;
}

function tree(ordered: OrderedXml, depth = 0, budget = { count: 0 }): (Element | string)[] {
  if (depth > 100) throw new BcnXmlError("payload-limit", "El XML BCN supera la profundidad admitida.");
  const output: (Element | string)[] = [];
  for (const entry of ordered) {
    if (++budget.count > 100_000) throw new BcnXmlError("payload-limit", "El XML BCN contiene demasiados elementos.");
    for (const [name, value] of Object.entries(entry)) {
      if (name === ":@") continue;
      if (name === "#text") { output.push(String(value)); continue; }
      if (name === "#cdata") { output.push(...tree(value as OrderedXml, depth + 1, budget)); continue; }
      const attributes: Record<string, string> = {};
      for (const [attribute, val] of Object.entries((entry[":@"] ?? {}) as Record<string, unknown>)) attributes[attribute.replace(/^@_/, "")] = String(val);
      output.push({ name, attributes, content: tree(value as OrderedXml, depth + 1, budget) });
    }
  }
  return output;
}

function plainText(element: Element | undefined): string {
  if (!element) return "";
  if (element.name === "ArchivoBinario") {
    const name = plainText(child(element, "Nombre"));
    return `[Archivo adjunto${name ? `: ${name}` : ""}]`;
  }
  const value = element.content.map((part) => typeof part === "string" ? part : plainText(part)).join("").replace(/\r\n?/g, "\n");
  return ["p", "div", "br"].includes(element.name.toLowerCase()) ? `\n${value}\n` : value;
}

function text(element: Element | undefined): string { return plainText(element).trim(); }

function date(value: string | undefined, label: string, warnings: Set<string>): string | null {
  if (!value) { warnings.add(`missing-${label}`); return null; }
  const day = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) {
    throw new BcnXmlError("invalid-response", `BCN contiene una fecha inválida (${label}).`);
  }
  return day;
}

function assertKnownChildren(element: Element, names: string[], repeatable: string[] = []) {
  const unknown = elements(element).find((part) => !names.includes(part.name));
  if (unknown || element.content.some((part) => typeof part === "string" && part.trim())) {
    throw new BcnXmlError("invalid-response", `Estructura BCN no admitida dentro de ${element.name}; requiere revisión del conector.`);
  }
  for (const name of names) {
    if (!repeatable.includes(name) && elements(element, name).length > 1) {
      throw new BcnXmlError("invalid-response", `La estructura BCN repite ${name} dentro de ${element.name}.`);
    }
  }
}

function structuralType(sourceType: string, transitory: boolean): BcnXmlNode["type"] {
  const normalized = sourceType.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (normalized === "articulo") return transitory ? "disposicion_transitoria" : "articulo";
  const known: Record<string, BcnXmlNode["type"]> = { titulo: "titulo", capitulo: "capitulo", parrafo: "parrafo", inciso: "inciso" };
  return known[normalized] ?? "agrupador";
}

/** Normalizes the documented BCN exchange tree without deriving legal validity from capture time. */
export function parseBcnXml(raw: string, capture: { url: string; capturedAt: string; checksum?: string }): BcnXmlDocument {
  validateBcnXmlPayload(raw);
  const checksum = createHash("sha256").update(raw, "utf8").digest("hex");
  if (capture.checksum && capture.checksum !== checksum) throw new BcnXmlError("invalid-response", "El checksum de la captura BCN no coincide con el XML.");
  let parsed: (Element | string)[];
  try {
    parsed = tree(parser.parse(raw) as OrderedXml);
  } catch (error) {
    if (error instanceof BcnXmlError) throw error;
    throw new BcnXmlError("invalid-response", "No fue posible interpretar la estructura XML de BCN.");
  }
  const roots = parsed.filter((entry): entry is Element => typeof entry !== "string");
  const norm = roots[0];
  if (roots.length !== 1 || norm.name !== "Norma") throw new BcnXmlError("invalid-response", "BCN no entregó una norma XML reconocible.");
  const sourceIdentifier = norm.attributes.normaId;
  if (!/^[1-9]\d{0,11}$/.test(sourceIdentifier ?? "")) throw new BcnXmlError("invalid-response", "La norma XML no contiene un identificador BCN válido.");
  assertKnownChildren(norm, ["Identificador", "Metadatos", "Encabezado", "EstructurasFuncionales", "Promulgacion", "Anexos", "ArchivosBinarios"]);
  const warnings = new Set<string>();
  const unsupported = new Set<string>();
  if (norm.attributes.SchemaVersion && norm.attributes.SchemaVersion !== "1.0") unsupported.add("unsupported-source-schema");
  let inputParts = 0, inputTexts = 0, representedTexts = 0;
  function inventory(element: Element) {
    if (["Encabezado", "Promulgacion", "EstructuraFuncional", "Anexo"].includes(element.name)) inputParts++;
    if (element.name === "Texto") inputTexts++;
    for (const nested of elements(element)) inventory(nested);
  }
  inventory(norm);
  const identification = child(norm, "Identificador");
  const pairs = child(identification, "TiposNumeros");
  const identifiers = pairs ? elements(pairs, "TipoNumero").map((pair) => ({ type: text(child(pair, "Tipo")), number: text(child(pair, "Numero")) })) : [];
  if (!identification || identifiers.length === 0 || identifiers.some((pair) => !pair.type || !pair.number)) throw new BcnXmlError("invalid-response", "La norma XML carece de tipo o número de identificación.");
  const metadata = child(norm, "Metadatos");
  const declaredTitle = text(child(metadata, "TituloNorma")) || text(child(metadata, "Titulo"));
  if (!declaredTitle) warnings.add("missing-title");
  const title = declaredTitle || `${identifiers[0].type} ${identifiers[0].number}`;
  const organismsElement = child(identification, "Organismos");
  const organisms = organismsElement ? elements(organismsElement, "Organismo").map(text).filter(Boolean) : [];
  const sourceStatus = norm.attributes.derogado ?? null;
  const nodes: BcnXmlNode[] = [];
  const keys = new Set<string>();
  const attachments: BcnXmlAttachment[] = [];

  function collectAttachments(element: Element) {
    if (element.name === "ArchivoBinario") {
      attachments.push({ name: text(child(element, "Nombre")) || null, mimeType: text(child(element, "TipoContenido")) || null,
        description: text(child(element, "Descripcion")) || null, embedded: Boolean(text(child(element, "DataCodificada"))) });
      warnings.add("binary-attachments-require-review");
      return;
    }
    for (const entry of elements(element)) collectAttachments(entry);
  }
  collectAttachments(norm);

  function addPart(part: Element, parentStableKey: string | null, fixedType?: BcnXmlNode["type"]) {
    assertKnownChildren(part, fixedType === "encabezado" || fixedType === "promulgacion" ? ["Texto"] : ["Texto", "Metadatos", "EstructurasFuncionales"]);
    const sourcePartId = part.attributes.idParte ?? null;
    if (!fixedType || fixedType === "anexo") {
      if (!/^\d{1,15}$/.test(sourcePartId ?? "")) throw new BcnXmlError("invalid-response", "Una parte XML carece de un identificador BCN estable.");
    }
    const stableKey = sourcePartId ? `bcn-${sourceIdentifier}-parte-${sourcePartId}` : `bcn-${sourceIdentifier}-${fixedType}`;
    if (keys.has(stableKey)) throw new BcnXmlError("invalid-response", "La norma XML contiene identificadores de parte duplicados.");
    keys.add(stableKey);
    const partMetadata = child(part, "Metadatos");
    const partTitle = text(child(partMetadata, "TituloParte")) || text(child(partMetadata, "Titulo")) || null;
    const partName = text(child(partMetadata, "NombreParte"));
    const sourceType = part.attributes.tipoParte ?? part.name;
    if (!fixedType && !part.attributes.tipoParte?.trim()) throw new BcnXmlError("invalid-response", "Una parte XML carece de su tipo estructural.");
    const transitory = part.attributes.transitorio?.trim().toLowerCase() === "transitorio";
    const type = fixedType ?? structuralType(sourceType, transitory);
    const defaultLabel = ({ encabezado: "Encabezado", promulgacion: "Promulgación", anexo: "Anexo" } as Record<string, string>)[type] ?? sourceType;
    let label = partName || partTitle || defaultLabel;
    if (["articulo", "disposicion_transitoria"].includes(type) && partName && !/^art[íi]?culo\b|^art\./i.test(partName)) label = `Artículo ${partName}`;
    if (transitory && !/transitori/i.test(label)) label += " transitorio";
    const body = child(part, "Texto");
    if (body) representedTexts++;
    const contentBlocks = body ? parseContent(body.content, unsupported) : [];
    const sourceMetadata = { ...part.attributes, sourceType, sourcePartId, transitory };
    const structures = elements(part).findIndex((e) => e.name === "EstructurasFuncionales");
    if (structures >= 0 && elements(part).slice(structures + 1).some((e) => e.name === "Texto")) unsupported.add("text-after-child-structures");
    nodes.push({ contentBlocks, sourceMetadata, stableKey, type, sourceType, label, title: partTitle, text: contentText(contentBlocks).trim(), position: nodes.length,
      parentStableKey, sourcePartId, versionDate: part.attributes.fechaVersion ? date(part.attributes.fechaVersion, "part-version-date", warnings) : null,
      sourceStatus: part.attributes.derogado ?? null, transitory });
    const children = child(part, "EstructurasFuncionales");
    if (children) {
      assertKnownChildren(children, ["EstructuraFuncional"], ["EstructuraFuncional"]);
      for (const nested of elements(children, "EstructuraFuncional")) addPart(nested, stableKey);
    }
  }

  for (const element of elements(norm)) {
    if (element.name === "Encabezado") addPart(element, null, "encabezado");
    if (element.name === "Promulgacion") addPart(element, null, "promulgacion");
    if (element.name === "EstructurasFuncionales") {
      assertKnownChildren(element, ["EstructuraFuncional"], ["EstructuraFuncional"]);
      for (const part of elements(element, "EstructuraFuncional")) addPart(part, null);
    }
    if (element.name === "Anexos") {
      assertKnownChildren(element, ["Anexo"], ["Anexo"]);
      for (const annex of elements(element, "Anexo")) addPart(annex, null, "anexo");
    }
  }
  if (!nodes.some((node) => node.text) && attachments.length === 0) throw new BcnXmlError("invalid-response", "La norma XML no contiene texto ni adjuntos reconocibles.");
  if (!nodes.some((node) => ["articulo", "disposicion_transitoria"].includes(node.type))) warnings.add("no-article-nodes");
  return {
    source: { name: "BCN LeyChile", sourceIdentifier, url: capture.url, capturedAt: capture.capturedAt, checksum, parser: BCN_XML_PARSER_VERSION },
    identity: { sourceIdentifier, ...identifiers[0], identifiers, title,
      publishedAt: date(identification.attributes.fechaPublicacion, "publication-date", warnings),
      promulgatedAt: identification.attributes.fechaPromulgacion ? date(identification.attributes.fechaPromulgacion, "promulgation-date", warnings) : null,
      versionDate: date(norm.attributes.fechaVersion, "version-date", warnings),
      status: sourceStatus?.trim().toLowerCase() === "derogado" ? "derogada" : "unknown", sourceStatus, organisms },
    nodes, attachments, warnings: [...warnings],
    coverage: { inputParts, representedParts: nodes.length, inputTexts, representedTexts, unsupported: [...unsupported] },
    sourceMetadata: { attributes: norm.attributes, metadata: metadata ?? null, identification: identification ?? null },
  };
}
