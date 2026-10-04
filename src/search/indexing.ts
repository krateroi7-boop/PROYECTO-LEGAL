import { eq } from "drizzle-orm";
import { normNodes, norms, searchDocuments } from "@/db/schema";
import type { SourceTransaction } from "@/sources/leases";

/** Projection only: the stored original and reader text are never truncated. */
export function searchFragments(text: string, size = 16_000): string[] {
  const fragments: string[] = [];
  while (text.length > size) {
    let cut = text.lastIndexOf(" ", size);
    if (cut < size / 2) cut = size;
    // Do not split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(text[cut - 1])) cut--;
    fragments.push(text.slice(0, cut)); text = text.slice(cut);
  }
  fragments.push(text); return fragments;
}
export async function replaceSearchIndex(tx: SourceTransaction, norm: typeof norms.$inferSelect, versionId: string) {
  await tx.delete(searchDocuments).where(eq(searchDocuments.normId, norm.id));
  const nodes = await tx.select().from(normNodes).where(eq(normNodes.versionId, versionId));
  const base = { normId: norm.id, versionId, slug: norm.slug, number: norm.number, type: norm.type, topics: norm.topics.join(" ") };
  const rows: (typeof searchDocuments.$inferInsert)[] = [{ ...base, documentType: "norm", title: norm.title, content: norm.description }];
  for (const node of nodes) for (const content of searchFragments(node.text)) rows.push({ ...base, documentType: "node", nodeId: node.id, nodeLabel: node.label, title: `${norm.title} · ${node.title ?? node.label}`, content });
  for (let i = 0; i < rows.length; i += 400) await tx.insert(searchDocuments).values(rows.slice(i, i + 400));
}
