import type { Article } from "@/lib/legislation";
import type { ArticleChange, LawVersion, VersionComparison } from "./types";

function articleText(article: Article) {
  return [article.number, article.title ?? "", ...article.paragraphs].join("\n").trim();
}

export function compareVersions(from: LawVersion, to: LawVersion): VersionComparison {
  if (from.law.slug !== to.law.slug) {
    throw new Error("Only versions of the same norm can be compared.");
  }

  const before = new Map(from.law.articles.map((article) => [article.id, article]));
  const after = new Map(to.law.articles.map((article) => [article.id, article]));
  const keys = [...new Set([...before.keys(), ...after.keys()])];
  const changes: ArticleChange[] = keys.map((key) => {
    const previous = before.get(key);
    const current = after.get(key);
    if (!previous && current) return { key, kind: "added", after: current };
    if (previous && !current) return { key, kind: "removed", before: previous };
    return {
      key,
      kind: articleText(previous!) === articleText(current!) ? "unchanged" : "modified",
      before: previous,
      after: current,
    };
  });

  return {
    from,
    to,
    changes,
    summary: changes.reduce(
      (summary, change) => ({ ...summary, [change.kind]: summary[change.kind] + 1 }),
      { added: 0, removed: 0, modified: 0, unchanged: 0 },
    ),
  };
}
