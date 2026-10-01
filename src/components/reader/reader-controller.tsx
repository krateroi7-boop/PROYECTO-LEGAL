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

type Props = { slug: string; title: string; version?: ReaderVersion; versions: ReaderVersion[]; nodes: ReaderIndexNode[]; initialTheme: string; initialSize: number; children: ReactNode; header: ReactNode; navigation: ReactNode; metadata: ReactNode };
export function ReaderController({ slug, title, version, versions, nodes, initialTheme, initialSize, children, header, navigation, metadata }: Props) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null), restore = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState(initialTheme), [size, setSize] = useState(initialSize), [active, setActive] = useState(""), [selected, setSelected] = useState<string>(), [panel, setPanel] = useState<"index" | "context" | "more" | "preferences" | "article" | null>(null), [tab, setTab] = useState<ContextTab>("fuente"), [search, setSearch] = useState(false), [status, setStatus] = useState(""), [missing, setMissing] = useState(""), [changes, setChanges] = useState<ReaderChanges | null>(), [changesLoading, setChangesLoading] = useState(false), [showChanges, setShowChanges] = useState(false);
  const drafts = useMemo(() => new Map<string, string>(), []);
  const target = useMemo(() => ({ slug, versionId: version?.id, stableKey: selected }), [slug, version?.id, selected]);
  const map = useMemo(() => new Map(nodes.map((node) => [node.stableKey, node])), [nodes]);
  const loadingChanges = useRef(false);
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
  const modal = panel !== null;
  useEffect(() => {
    const element = dialog.current;
    if (modal && element && !element.open) { restore.current = document.activeElement as HTMLElement; element.showModal(); }
    else if (!modal && element?.open) { element.close(); restore.current?.focus({ preventScroll: true }); }
  }, [modal]);
  useEffect(() => {
    if (panel) dialog.current?.querySelector<HTMLButtonElement>(".reader-dialog-close")?.focus({ preventScroll: true });
  }, [panel]);
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
    if (action === "menu") { setSelected(key); setPanel("article"); return; }
    if (action === "context" || action === "save" || action === "notes") { openContext(key, action === "context" ? "relaciones" : "notas"); return; }
    closePanel();
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
  const changeControls = <><label className="reader-changes-toggle"><input type="checkbox" checked={showChanges} onChange={(event) => { setShowChanges(event.target.checked); if (event.target.checked) void loadChanges(); }} /> Mostrar cambios en el documento</label>{showChanges && <p role="status">{changesLoading ? "Cargando cambios…" : changes === null ? "Sin versión anterior disponible" : changes ? "Cambios textuales respecto de la versión anterior" : "Cambios no disponibles"}</p>}</>;
  const context = <ContextPanel key={`${selected ?? "norm"}/${tab}`} target={target} title={selected && map.has(selected) ? readerHeading(map.get(selected)!) : title} tab={tab} setTab={setTab} metadata={metadata} changes={changes} changesLoading={changesLoading} loadChanges={() => void loadChanges()} drafts={drafts} changeControls={changeControls} />;
  const searchRestore = useRef<HTMLElement | null>(null);
  function openSearch() { searchRestore.current = document.activeElement as HTMLElement; closePanel(); setSearch(true); }
  function closeSearch() { setSearch(false); searchRestore.current?.focus({ preventScroll: true }); }
  return <div ref={root} className="legal-reader" data-theme={theme} style={{ "--reader-font-size": `${size}px` } as React.CSSProperties} onClick={(event) => {
    const element = event.target as HTMLElement;
    const button = element.closest<HTMLElement>("[data-reader-action]");
    if (button?.dataset.key && button.dataset.readerAction) void articleAction(button.dataset.readerAction, button.dataset.key);
  }}>
    <a className="reader-skip" href="#reader-text">Saltar al texto de la norma</a>
    {navigation}
    {search && <InDocumentSearch root={root} close={closeSearch} />}
    {missing && <p className="reader-notice" role="status">El artículo solicitado no existe en esta versión. <a href={readerUrl(slug, undefined, missing)}>Buscarlo en la versión actual</a> · <button onClick={() => router.back()}>Volver a la versión anterior</button></p>}
    <p className="reader-status" role="status">{status}</p>
    <div className="reader-layout">
      <aside className="reader-index-desktop"><TableOfContents nodes={nodes} active={active} onNavigate={noNavigationAction} /></aside>
      <main id="reader-text" tabIndex={-1} className="reader-body">
        {header}
        <nav className="reader-document-tools" aria-label="Herramientas de lectura">
          <button className="reader-search-trigger" onClick={openSearch}>Buscar en esta norma</button>
          <a href={`/normas/${slug}/versiones`}>Historial</a>
          <a href="#fuente" onClick={(event) => { event.preventDefault(); openContext(); }}>Fuente</a>
          <button aria-label="Preferencias de lectura" aria-haspopup="dialog" onClick={() => setPanel("preferences")}>Aa</button>
          <button aria-haspopup="dialog" onClick={() => setPanel("more")}>Más</button>
        </nav>
        {version && !version.isCurrent && <p className="reader-historical-return"><a href={readerUrl(slug, undefined, active || undefined)}>Volver a la versión actual</a></p>}
        {children}
      </main>
    </div>
    <nav className="reader-mobile-bar" aria-label="Herramientas móviles"><button onClick={() => { setSearch(false); setPanel("index"); }}>Índice</button><button onClick={openSearch}>Buscar</button><button onClick={() => setPanel("more")}>Más</button></nav>
    <dialog ref={dialog} className="reader-dialog" data-panel={panel ?? undefined} aria-label={panel === "index" ? "Índice de la norma" : panel === "preferences" ? "Preferencias de lectura" : panel === "article" ? "Acciones del artículo" : panel === "context" ? "Contexto de la norma" : "Herramientas de la norma"} onCancel={closePanel} onClose={closePanel}>
      <button className="reader-dialog-close" onClick={closePanel} aria-label="Cerrar panel">Cerrar ×</button>
      {panel === "index" && <TableOfContents nodes={nodes} active={active} onNavigate={closePanel} />}
      {panel === "context" && context}
      {panel === "preferences" && <section className="reader-preferences"><h2>Preferencias de lectura</h2><fieldset><legend>Tamaño del texto</legend><div className="reader-preference-options"><button aria-label="Reducir tamaño del texto" disabled={size <= 16} onClick={() => preference("size", String(size - 2))}>A−</button><button aria-label="Restablecer tamaño del texto" onClick={() => preference("size", "18")}>A</button><button aria-label="Aumentar tamaño del texto" disabled={size >= 22} onClick={() => preference("size", String(size + 2))}>A+</button><output aria-label="Tamaño actual">{size} px</output></div></fieldset><fieldset><legend>Tema</legend><div className="reader-preference-options">{(["system", "light", "dark"] as const).map((value) => <button key={value} aria-pressed={theme === value} onClick={() => preference("theme", value)}>{{ system: "Sistema", light: "Claro", dark: "Oscuro" }[value]}</button>)}</div></fieldset></section>}
      {panel === "article" && selected && <section className="reader-action-menu"><h2>{map.has(selected) ? readerHeading(map.get(selected)!) : "Artículo"}</h2>{(["copy", "link", "share", "save", "notes", "context"] as const).map((action) => <button key={action} onClick={() => void articleAction(action, selected)}>{{ copy: "Copiar texto", link: "Copiar enlace", share: "Compartir", save: "Guardar / quitar de favoritos", notes: "Añadir / ver notas", context: "Ver relaciones / contexto" }[action]}</button>)}</section>}
      {panel === "more" && <section className="reader-action-menu"><h2>Herramientas de la norma</h2>
        {version && <label className="reader-version-picker">Versión consultada<select aria-label="Seleccionar versión" value={version.id} onChange={(event) => { closePanel(); router.push(readerUrl(slug, event.target.value, active || undefined)); }}>{versions.map((v) => <option value={v.id} key={v.id}>{v.label} · {v.dateLabel}</option>)}</select></label>}
        <a href={`/normas/${slug}/versiones`}>Historial de versiones</a>
        <button onClick={() => openContext(undefined, "notas")}>Guardar norma / mis notas</button>
        <button onClick={() => openContext(undefined, "cambios")}>Cambios</button>
        <button onClick={() => openContext(undefined, "relaciones")}>Relaciones</button>
        <button onClick={() => openContext()}>Fuente y procedencia</button>
        <button onClick={() => setPanel("preferences")}>Preferencias de lectura</button>
      </section>}
    </dialog>
  </div>;
}
