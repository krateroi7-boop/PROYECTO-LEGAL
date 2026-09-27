import { createHash } from "node:crypto";
import { BCN_PARSER_VERSION } from "./config";
import type { BcnHtmlNode, BcnNormResponse, BcnPilotMetadata, BcnStagingArticle, BcnStagingSnapshot } from "./types";

export function parseBcnNorm(raw: string, metadata: BcnPilotMetadata): BcnStagingSnapshot {
  let response: BcnNormResponse;
  try {
    response = JSON.parse(raw) as BcnNormResponse;
  } catch {
    throw new Error("BCN response is not valid JSON.");
  }
  if (!response || !Array.isArray(response.html)) throw new Error("BCN response does not contain an html node list.");

  const articles: BcnStagingArticle[] = [];
  walk(response.html, articles);
  if (articles.length === 0) throw new Error("BCN response does not contain recognizable articles.");
  if (new Set(articles.map((article) => article.id)).size !== articles.length) {
    throw new Error("BCN response contains ambiguous or duplicate article identifiers.");
  }

  return {
    source: {
      name: "BCN LeyChile",
      url: metadata.sourceUrl,
      capturedAt: metadata.capturedAt,
      checksum: createHash("sha256").update(raw).digest("hex"),
      parser: BCN_PARSER_VERSION,
    },
    norm: metadata,
    articles,
  };
}

function walk(nodes: BcnHtmlNode[], articles: BcnStagingArticle[]) {
  for (const node of nodes) {
    const paragraphs = extractParagraphs(node.t ?? "");
    const first = paragraphs[0] ?? "";
    const match = first.match(/^\s*Artículo\s+(único|\d+)(?:[°º])?(?:\s+(bis|ter|qu[aá]ter|quinquies|sexies|septies|octies|nonies|decies))?(?:\s+(transitorio))?(?:\s*[.\-:]\s*|\s+|$)(.*)$/i);
    if (match && paragraphs.length > 0) {
      const suffix = [match[2], match[3]].filter(Boolean).join(" ").toLowerCase();
      const number = /^único$/i.test(match[1]) ? "único" : `${match[1]}${suffix ? ` ${suffix}` : "°"}`;
      const body = match[4].trim();
      const title = extractArticleTitle(body);
      const firstParagraph = title ? body.slice(body.indexOf(".") + 1).trim() : body;
      articles.push({
        id: node.i !== undefined ? `bcn-parte-${node.i}` : `articulo-${number.replace(/[°º]/g, "").replace(/\s+/g, "-")}`,
        number,
        title: title || undefined,
        paragraphs: [firstParagraph, ...paragraphs.slice(1)].filter(Boolean),
        sourcePartId: node.i,
        sourceFlags: node.v ?? [],
      });
    }
    if (node.h) walk(node.h, articles);
  }
}

function extractParagraphs(html: string) {
  const matches = [...html.matchAll(/<div[^>]*class=["']p["'][^>]*>([\s\S]*?)<\/div>/gi)];
  const values = matches.length > 0 ? matches.map((match) => cleanText(match[1])) : [cleanText(html)];
  return values.filter(Boolean);
}

function extractArticleTitle(value: string) {
  const separator = value.indexOf(".");
  if (separator < 0 || separator > 120) return "";
  return value.slice(0, separator).trim();
}

function cleanText(value: string) {
  // Remove actual markup before decoding: encoded < and > are legal text.
  return decodeHtmlEntities(value
    .replace(/<span\b[^>]*class=["']n["'][^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    nbsp: " ", quot: '"', lt: "<", gt: ">", apos: "'", amp: "&",
    aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
    Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
    ordm: "º", ordf: "ª", deg: "°", ndash: "–", mdash: "—", laquo: "«", raquo: "»", sect: "§",
  };
  // Decode once: &amp;lt; is literal "&lt;", not another HTML tag or comparison operator.
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, encoded: string) => {
    if (!encoded.startsWith("#")) return named[encoded] ?? entity;
    const hexadecimal = /^#x/i.test(encoded);
    const codePoint = Number.parseInt(encoded.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff) ? String.fromCodePoint(codePoint) : entity;
  });
}
