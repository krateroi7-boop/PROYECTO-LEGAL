import type { ReaderIndexNode } from "./types";

export type IndexBranch = ReaderIndexNode & { children: IndexBranch[]; depth: number };

/** Build once in linear time after sorting by position. Broken/cyclic parents become roots; no node is silently lost. */
export function buildReaderTree(nodes: ReaderIndexNode[]): IndexBranch[] {
  const ordered = [...nodes].sort((a, b) => a.position - b.position);
  const entries = new Map(ordered.map((node) => [node.stableKey, { ...node, children: [], depth: 0 } as IndexBranch]));
  const state = new Map<string, "visiting" | "done">();
  function resolve(node: IndexBranch): void {
    if (state.get(node.stableKey) === "done") return;
    state.set(node.stableKey, "visiting");
    const parent = node.parentStableKey ? entries.get(node.parentStableKey) : undefined;
    if (!parent || parent === node || state.get(parent.stableKey) === "visiting") node.parentStableKey = null;
    else { resolve(parent); node.depth = parent.depth + 1; }
    state.set(node.stableKey, "done");
  }
  for (const node of entries.values()) resolve(node);
  const roots: IndexBranch[] = [];
  for (const node of entries.values()) {
    const parent = node.parentStableKey ? entries.get(node.parentStableKey) : undefined;
    if (parent) parent.children.push(node); else roots.push(node);
  }
  return roots;
}

export function readerUrl(slug: string, versionId?: string, stableKey?: string) {
  return `/normas/${encodeURIComponent(slug)}${versionId ? `/versiones/${encodeURIComponent(versionId)}` : ""}${stableKey ? `#${encodeURIComponent(stableKey)}` : ""}`;
}

export function readerHeading(node: Pick<ReaderIndexNode, "label" | "title">) {
  return node.title && node.title !== node.label ? `${node.label} · ${node.title}` : node.label;
}
