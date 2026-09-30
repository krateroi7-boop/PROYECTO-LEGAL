"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildReaderTree, readerHeading, type IndexBranch } from "@/lib/reader/structure";
import type { ReaderIndexNode } from "@/lib/reader/types";

export const TableOfContents = memo(function TableOfContents({ nodes, active, onNavigate }: { nodes: ReaderIndexNode[]; active: string; onNavigate: () => void }) {
  const tree = useMemo(() => buildReaderTree(nodes), [nodes]);
  const parents = useMemo(() => new Map(nodes.map((n) => [n.stableKey, n.parentStableKey])), [nodes]);
  const [state, setState] = useState({ active, keys: new Set<string>() });
  const navigation = useRef<HTMLElement>(null), current = useRef(active);
  const collapsed = useMemo(() => {
    if (state.active === active || !state.keys.size) return state.keys;
    const path = new Set<string>();
    let parent = parents.get(active);
    while (parent && !path.has(parent)) { path.add(parent); parent = parents.get(parent); }
    const remaining = [...state.keys].filter((key) => !path.has(key));
    return remaining.length === state.keys.size ? state.keys : new Set(remaining);
  }, [state, active, parents]);
  useEffect(() => {
    current.current = active;
    // Updating the reading marker must not reconcile ten thousand links on every scroll.
    navigation.current?.querySelector("[aria-current]")?.removeAttribute("aria-current");
    navigation.current?.querySelector(`a[href="#${CSS.escape(encodeURIComponent(active))}"]`)?.setAttribute("aria-current", "location");
  }, [active, collapsed]);
  const toggle = useCallback((key: string) => {
    const keys = new Set(collapsed);
    if (keys.has(key)) keys.delete(key); else keys.add(key);
    setState({ active: current.current, keys });
  }, [collapsed]);
  const content = useMemo(() => {
    function branch(items: IndexBranch[]) {
      return <ol>{items.map((node) => <li key={node.stableKey}>
        <div className="reader-index-row">
          {node.children.length > 0 && <button type="button" aria-label={`${collapsed.has(node.stableKey) ? "Expandir" : "Contraer"} ${node.label}`} aria-expanded={!collapsed.has(node.stableKey)} onClick={() => toggle(node.stableKey)}>{collapsed.has(node.stableKey) ? "+" : "−"}</button>}
          <a href={`#${encodeURIComponent(node.stableKey)}`} onClick={onNavigate}>{readerHeading(node)}</a>
        </div>
        {node.children.length > 0 && !collapsed.has(node.stableKey) && branch(node.children)}
      </li>)}</ol>;
    }
    return branch(tree);
  }, [tree, collapsed, onNavigate, toggle]);
  return <nav ref={navigation} className="reader-index" aria-label="Índice jurídico"><h2>En esta norma</h2>{content}</nav>;
});
