"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { loadReaderChanges } from "@/app/actions/reader";
import { readerHeading, readerUrl } from "@/lib/reader/structure";
import type { ReaderChanges, ReaderIndexNode, ReaderVersion } from "@/lib/reader/types";
import { TableOfContents } from "./table-of-contents";
import { InDocumentSearch } from "./in-document-search";
import { ContextPanel, type ContextTab } from "./context-panel";

const noNavigationAction = () => {};

type Props = { slug: string; title: string; version?: ReaderVersion; versions: ReaderVersion[]; nodes: ReaderIndexNode[]; initialTheme: string; initialSize: number; children: ReactNode; header: ReactNode; metadata: ReactNode };
export function ReaderController({ slug, title, version, versions, nodes, initialTheme, initialSize, children, header, metadata }: Props) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null), restore = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState(initialTheme), [size, setSize] = useState(initialSize), [active, setActive] = useState(""), [selected, setSelected] = useState<string>(), [panel, setPanel] = useState<"index" | "context" | null>(null), [tab, setTab] = useState<ContextTab>("fuente"), [search, setSearch] = useState(false), [status, setStatus] = useState(""), [missing, setMissing] = useState(""), [changes, setChanges] = useState<ReaderChanges | null>(), [changesLoading, setChangesLoading] = useState(false), [showChanges, setShowChanges] = useState(false), [wide, setWide] = useState(false);
  const drafts = useMemo(() => new Map<string, string>(), []);
  const target = useMemo(() => ({ slug, versionId: version?.id, stableKey: selected }), [slug, version?.id, selected]);
  const map = useMemo(() => new Map(nodes.map((node) => [node.stableKey, node])), [nodes]);
  const loadingChanges = useRef(false);
  useEffect(() => {
    const query = matchMedia("(min-width: 1440px)"); const update = () => setWide(query.matches); update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const onHash = () => {
      let key = ""; try { key = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      if (map.has(key)) { setActive(key); setMissing(""); }
      else if (key && key !== "fuente" && key !== "reader-text") setMissing(key);
    };
    onHash(); window.addEventListener("hashchange", onHash);
    const intersecting = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) { if (entry.isIntersecting) intersecting.add(entry.target); else intersecting.delete(entry.target); }
      const visible = [...intersecting].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const key = visible[0]?.parentElement?.id;
      if (key) setActive(key);
    }, { rootMargin: "-80px 0px -60% 0px" });
    root.current?.querySelectorAll(".reader-node-heading").forEach((node) => observer.observe(node));
    return () => { observer.disconnect(); window.removeEventListener("hashchange", onHash); };
  }, [map]);
  const modal = panel === "index" || (panel === "context" && !wide);
  useEffect(() => {
    const element = dialog.current;
    if (modal && element && !element.open) { restore.current = document.activeElement as HTMLElement; element.showModal(); }
    else if (!modal && element?.open) { element.close(); restore.current?.focus(); }
  }, [modal]);
  const closePanel = useCallback(() => setPanel(null), []);
  const loadChanges = useCallback(async () => {
    if (!version || changes !== undefined || loadingChanges.current) return;
    loadingChanges.current = true; setChangesLoading(true);
    try { setChanges(await loadReaderChanges({ slug, versionId: version.id })); }
    catch { setStatus("No se pudieron cargar los cambios. Puedes reintentar."); }
    finally { setChangesLoading(false); loadingChanges.current = false; }
  }, [slug, version, changes]);
  useEffect(() => {
    if (!showChanges || !changes) return;
    const badges: HTMLElement[] = [];
    for (const change of changes.changes) {
      if (change.kind !== "added" && change.kind !== "modified") continue;
      const badge = document.getElementById(change.key)?.querySelector<HTMLElement>(":scope > .reader-node-heading > [data-change-badge]");
      if (badge) { badge.textContent = change.kind === "added" ? "Agregado" : "Modificado"; badges.push(badge); }
    }
    return () => { for (const badge of badges) badge.textContent = ""; };
  }, [changes, showChanges]);
  function preference(kind: "theme" | "size", value: string) {
    document.cookie = `reader-${kind}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
    if (kind === "theme") setTheme(value); else setSize(Number(value));
  }
  function openContext(key?: string, nextTab: ContextTab = "fuente") { setSelected(key); setTab(nextTab); setPanel("context"); if (nextTab === "cambios") void loadChanges(); }
  async function articleAction(action: string, key: string) {
    if (action === "context" || action === "save") { openContext(key, action === "save" ? "notas" : "relaciones"); return; }
    const href = new URL(readerUrl(slug, version?.id, key), location.origin).href;
    try {
      if (action === "share" && navigator.share) await navigator.share({ title, url: href });
      else {
        let text = href;
        if (action === "copy") {
          const article = document.getElementById(key);
          const content = Array.from(article?.querySelectorAll("[data-reader-text]") ?? []).map((part) => part.textContent).join("\n\n");
          text = `${content}\n\n${title}\n${version?.label ?? "Versión de consulta"}${version ? ` · ${version.dateLabel}` : ""}\n${href}`;
        }
        await navigator.clipboard.writeText(text);
        setStatus(action === "copy" ? "Texto copiado con su versión y enlace." : "Enlace de esta versión copiado.");
      }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("No se pudo copiar o compartir. Puedes copiar la dirección desde el enlace del artículo."); }
  }
  const context = <ContextPanel key={`${selected ?? "norm"}/${tab}`} target={target} title={selected && map.has(selected) ? readerHeading(map.get(selected)!) : title} tab={tab} setTab={setTab} metadata={metadata} changes={changes} changesLoading={changesLoading} loadChanges={() => void loadChanges()} drafts={drafts} />;
  return <div ref={root} className="legal-reader" data-theme={theme} style={{ "--reader-font-size": `${size}px` } as React.CSSProperties} onClick={(event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-reader-action]");
    if (button?.dataset.key && button.dataset.readerAction) void articleAction(button.dataset.readerAction, button.dataset.key);
  }}>
    <a className="reader-skip" href="#reader-text">Saltar al texto de la norma</a>
    {header}
    <div className="reader-toolbar" aria-label="Herramientas de lectura">
      <nav aria-label="Secciones de la norma"><a href="#reader-text">Texto</a><a href={`/normas/${slug}/versiones`} aria-label="Historial">Versiones</a><button onClick={() => openContext(undefined, "cambios")}>Cambios</button><button onClick={() => openContext(undefined, "relaciones")}>Relaciones</button></nav>
      <div className="reader-preferences"><label>Tamaño <select aria-label="Tamaño del texto" value={size} onChange={(event) => preference("size", event.target.value)}>{[16, 18, 20, 22].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><label>Tema <select aria-label="Tema" value={theme} onChange={(event) => preference("theme", event.target.value)}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label><button onClick={() => { setSearch((value) => !value); closePanel(); }}>Buscar en la norma</button><button onClick={() => openContext()}>Contexto</button></div>
    </div>
    {search && <InDocumentSearch root={root} close={() => setSearch(false)} />}
    <div className="reader-version-bar">
      {version && <><label>Versión <select aria-label="Seleccionar versión" value={version.id} onChange={(event) => router.push(readerUrl(slug, event.target.value, active || undefined))}>{versions.map((v) => <option value={v.id} key={v.id}>{v.label}{v.isCurrent ? " · Actual" : ""}</option>)}</select></label><span>{version.isCurrent ? "Versión de consulta actual" : "Versión histórica"}</span>{!version.isCurrent && <a href={readerUrl(slug, undefined, active || undefined)}>Volver a la versión actual</a>}</>}
      <label className="reader-changes-toggle"><input type="checkbox" checked={showChanges} onChange={(event) => { setShowChanges(event.target.checked); if (event.target.checked) void loadChanges(); }} /> Mostrar cambios</label>
      {showChanges && <span role="status">{changesLoading ? "Cargando cambios…" : changes === null ? "Sin versión anterior disponible" : changes ? "Cambios textuales respecto de la versión anterior" : "Cambios no disponibles"}</span>}
    </div>
    {missing && <p className="reader-notice" role="status">El artículo «{missing}» no existe en esta versión. <a href={readerUrl(slug, undefined, missing)}>Buscarlo en la versión actual</a> · <button onClick={() => router.back()}>Volver a la versión anterior</button></p>}
    <p className="reader-status" role="status">{status}</p>
    <div className="reader-layout"><aside className="reader-index-desktop"><TableOfContents nodes={nodes} active={active} onNavigate={noNavigationAction} /></aside><main id="reader-text" tabIndex={-1} className="reader-body">{children}</main><aside className="reader-context-desktop" aria-label="Contexto de la norma">{wide ? context : <div className="reader-context-content"><h2>Fuente y contexto</h2>{metadata}</div>}</aside></div>
    <nav className="reader-mobile-bar" aria-label="Herramientas móviles"><button onClick={() => { setSearch(false); setPanel("index"); }}>Índice</button><button onClick={() => { closePanel(); setSearch(true); }}>Buscar</button><button onClick={() => { setSearch(false); openContext(active || undefined); }}>Contexto</button></nav>
    <dialog ref={dialog} className="reader-dialog" onCancel={closePanel} onClose={closePanel}><button className="reader-dialog-close" onClick={closePanel} aria-label="Cerrar panel">Cerrar ×</button>{panel === "index" ? <TableOfContents nodes={nodes} active={active} onNavigate={closePanel} /> : panel === "context" && !wide ? context : null}</dialog>
  </div>;
}
