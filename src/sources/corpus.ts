import corpus from "../../config/public-corpus.json";
export const publicCorpus = corpus.documents;
const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
/** Editorial search hints. They never assert that the upstream title or text was already captured. */
export function corpusReference(input: string) {
  const selected = publicCorpus.find((document) => normalize(document.name) === normalize(input));
  return selected ? { kind: "idNorma" as const, value: selected.externalId } : undefined;
}
export function sourceSlug(source: string, id: string, title: string) {
  const selected = publicCorpus.find((document) => document.source === source && document.externalId === id);
  if (selected) return selected.slug;
  const readable = normalize(title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 65).replace(/-$/, "");
  return `${readable || "norma"}-${source === "bcn-leychile" ? "bcn" : source.replace(/[^a-z0-9-]/g, "")}-${id}`;
}
