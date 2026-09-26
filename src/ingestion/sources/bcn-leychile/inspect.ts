import type { BcnStagingSnapshot } from "./types";

export function inspectBcnSnapshot(snapshot: BcnStagingSnapshot) {
  const flags = new Map<string, number>();
  for (const article of snapshot.articles) {
    for (const flag of article.sourceFlags) flags.set(flag, (flags.get(flag) ?? 0) + 1);
  }
  return {
    articles: snapshot.articles.length,
    paragraphs: snapshot.articles.reduce((total, article) => total + article.paragraphs.length, 0),
    flags: Object.fromEntries(flags),
    emptyArticles: snapshot.articles.filter((article) => article.paragraphs.every((paragraph) => !paragraph.trim())).map((article) => article.id),
    ordered: snapshot.articles.every((article, index) => article.id === `articulo-${index + 1}`),
    source: snapshot.source,
  };
}
