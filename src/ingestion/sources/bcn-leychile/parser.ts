import { createHash } from "node:crypto";
import type { BcnHtmlNode, BcnNormResponse, BcnPilotMetadata, BcnStagingArticle, BcnStagingSnapshot } from "./types";

export function parseBcnNorm(raw: string, metadata: BcnPilotMetadata): BcnStagingSnapshot {
  let response: BcnNormResponse;
  try {
    response = JSON.parse(raw) as BcnNormResponse;
  } catch {
    throw new Error("BCN response is not valid JSON.");
  }
  if (!Array.isArray(response.html)) throw new Error("BCN response does not contain an html node list.");

  const articles: BcnStagingArticle[] = [];
  walk(response.html, articles);
  if (articles.length === 0) throw new Error("BCN response does not contain recognizable articles.");

  return {
    source: {
      name: "BCN LeyChile",
      url: metadata.sourceUrl,
      capturedAt: metadata.capturedAt,
      checksum: createHash("sha256").update(raw).digest("hex"),
      parser: "bcn-leychile-json-v1",
    },
    norm: metadata,
    articles,
  };
}

function walk(nodes: BcnHtmlNode[], articles: BcnStagingArticle[]) {
  for (const node of nodes) {
    const paragraphs = extractParagraphs(node.t ?? "");
    const first = paragraphs[0] ?? "";
    const match = first.match(/^\s*Artículo\s+(\d+)\s*(?:[°º.]?)(?:\.\s*|\s+)(.*)$/i);
    if (match && paragraphs.length > 0) {
      const title = extractArticleTitle(match[2]);
      articles.push({
        id: `articulo-${articles.length + 1}`,
        number: `${match[1]}°`,
        title: title || undefined,
        paragraphs: paragraphs.map((paragraph, index) => index === 0 && title ? stripArticleHeading(paragraph, title) : paragraph).filter(Boolean),
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

function stripArticleHeading(paragraph: string, title: string) {
  const normalizedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return paragraph.replace(new RegExp(`^Artículo\\s+\\d+\\s*[°º.]?\\s*${normalizedTitle}\\.?\\s*`, "i"), "").trim();
}

function cleanText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<span\b[^>]*class=["']n["'][^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, " ")
    .replace(/&#39;|&apos;/gi, "'");
}
