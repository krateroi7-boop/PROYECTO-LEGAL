"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { searchBlocks, yieldReaderWork } from "@/lib/reader/search";

type Hit = { element: HTMLElement; range: Range; start: number; end: number; text: string };
type HighlightAPI = { highlights: Map<string, unknown> };

export function InDocumentSearch({ root, close }: { root: RefObject<HTMLDivElement | null>; close: () => void }) {
  const [query, setQuery] = useState(""), [hits, setHits] = useState<Hit[]>([]), [index, setIndex] = useState(0), [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const registry = (globalThis.CSS as unknown as HighlightAPI | undefined)?.highlights;
    registry?.delete("reader-matches"); registry?.delete("reader-active");
    if (!query.trim()) return;
    const timer = setTimeout(async () => {
      try {
        const elements = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-reader-text]") ?? []);
        const found = await searchBlocks(elements.map((value) => ({ value, text: value.textContent ?? "" })), query, controller.signal);
        if (controller.signal.aborted) return;
        const next: Hit[] = [];
        let slice = performance.now();
        for (const block of found) {
          // DOM offsets follow the complete text stream, including inline emphasis and links.
          const text = block.value.textContent ?? "";
          const walker = document.createTreeWalker(block.value, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode() as Text | null;
          let offset = 0;
          for (const match of block.matches) {
            while (node && offset + node.length <= match.start) { offset += node.length; node = walker.nextNode() as Text | null; }
            if (!node) break;
            const startNode = node, startOffset = match.start - offset;
            while (node && offset + node.length < match.end) { offset += node.length; node = walker.nextNode() as Text | null; }
            if (!node) break;
            const range = document.createRange(); range.setStart(startNode, startOffset); range.setEnd(node, match.end - offset);
            next.push({ element: block.value, range, ...match, text });
            if (performance.now() - slice > 8) { await yieldReaderWork(); slice = performance.now(); if (controller.signal.aborted) return; }
          }
        }
        setHits(next); setBusy(false);
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setBusy(false); }
    }, 180);
    return () => { controller.abort(); clearTimeout(timer); registry?.delete("reader-matches"); registry?.delete("reader-active"); };
  }, [query, root]);
  useEffect(() => {
    const registry = (globalThis.CSS as unknown as HighlightAPI | undefined)?.highlights;
    const Highlight = (globalThis as unknown as { Highlight?: new () => { add: (range: Range) => void; delete: (range: Range) => void } }).Highlight;
    if (!registry || !Highlight || !hits.length) return;
    const highlight = new Highlight();
    const blocks = new Map<HTMLElement, Range[]>();
    for (const hit of hits) { const ranges = blocks.get(hit.element) ?? []; ranges.push(hit.range); blocks.set(hit.element, ranges); }
    // Count all matches, but paint those near the viewport. The legal DOM stays intact.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) for (const range of blocks.get(entry.target as HTMLElement) ?? []) {
        if (entry.isIntersecting) highlight.add(range); else highlight.delete(range);
      }
    }, { rootMargin: "200px" });
    for (const element of blocks.keys()) observer.observe(element);
    registry.set("reader-matches", highlight);
    return () => { observer.disconnect(); registry.delete("reader-matches"); };
  }, [hits]);
  useEffect(() => {
    const hit = hits[index];
    if (!hit) return;
    hit.element.setAttribute("data-search-active", "true");
    hit.element.scrollIntoView({ block: "center", behavior: "instant" });
    const registry = (globalThis.CSS as unknown as HighlightAPI | undefined)?.highlights;
    const Highlight = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (registry && Highlight) registry.set("reader-active", new Highlight(hit.range));
    return () => { hit.element.removeAttribute("data-search-active"); registry?.delete("reader-active"); };
  }, [hits, index]);
  function changeQuery(value: string) { setQuery(value); setHits([]); setIndex(0); setBusy(Boolean(value.trim())); }
  const move = (delta: number) => setIndex((value) => hits.length ? (value + delta + hits.length) % hits.length : 0);
  const hit = hits[index];
  return <section className="reader-search" aria-label="Buscar dentro de la norma">
    <div className="reader-search-controls"><label htmlFor="reader-query" className="sr-only">Buscar dentro de la norma</label><input id="reader-query" ref={input} value={query} maxLength={200} placeholder="Buscar dentro de esta norma" onChange={(event) => changeQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); move(event.shiftKey ? -1 : 1); } if (event.key === "Escape") close(); }} />
    <button onClick={() => move(-1)} disabled={!hits.length} aria-label="Coincidencia anterior">↑</button><button onClick={() => move(1)} disabled={!hits.length} aria-label="Coincidencia siguiente">↓</button><button onClick={() => changeQuery("")} disabled={!query}>Limpiar</button><button onClick={close} aria-label="Cerrar búsqueda">×</button></div>
    <p role="status">{busy ? "Buscando…" : query.trim() ? `${hits.length ? index + 1 : 0} de ${hits.length} coincidencias` : "Busca en el texto de esta versión. Enter: siguiente; Mayús + Enter: anterior."}</p>
    {hit && <p className="reader-search-snippet">…{hit.text.slice(Math.max(0, hit.start - 45), hit.start)}<mark>{hit.text.slice(hit.start, hit.end)}</mark>{hit.text.slice(hit.end, hit.end + 65)}…</p>}
  </section>;
}
