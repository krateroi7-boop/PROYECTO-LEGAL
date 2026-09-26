import type { BcnStagingSnapshot } from "./types";

export function diffBcnSnapshots(previous: BcnStagingSnapshot, current: BcnStagingSnapshot) {
  const previousById = new Map(previous.articles.map((article) => [article.id, article]));
  const currentById = new Map(current.articles.map((article) => [article.id, article]));
  const added = current.articles.filter((article) => !previousById.has(article.id)).map((article) => article.id);
  const removed = previous.articles.filter((article) => !currentById.has(article.id)).map((article) => article.id);
  const changed = current.articles
    .filter((article) => {
      const old = previousById.get(article.id);
      return old && JSON.stringify(old) !== JSON.stringify(article);
    })
    .map((article) => article.id);
  return { added, removed, changed, previousChecksum: previous.source.checksum, currentChecksum: current.source.checksum };
}
