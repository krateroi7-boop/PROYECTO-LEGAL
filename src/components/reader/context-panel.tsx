"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadReaderPersonal, loadReaderRelations } from "@/app/actions/reader";
import { createAnnotation, deleteAnnotationAction, toggleFavorite } from "@/app/actions/personal";
import { readerUrl } from "@/lib/reader/structure";
import type { ReaderChanges, ReaderPersonal, ReaderRelation, ReaderTarget } from "@/lib/reader/types";

export type ContextTab = "fuente" | "relaciones" | "notas" | "cambios";
export function ContextPanel({ target, title, tab, setTab, metadata, changes, changesLoading, loadChanges, drafts, changeControls }: {
  target: ReaderTarget; title: string; tab: ContextTab; setTab: (tab: ContextTab) => void; metadata: ReactNode;
  changes: ReaderChanges | null | undefined; changesLoading: boolean; loadChanges: () => void; drafts: Map<string, string>; changeControls?: ReactNode;
}) {
  const [personal, setPersonal] = useState<ReaderPersonal>(), [relations, setRelations] = useState<ReaderRelation[]>(), [error, setError] = useState(""), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const draftKey = `${target.versionId}/${target.stableKey ?? ""}`;
  const [draft, setDraft] = useState(drafts.get(draftKey) ?? "");
  const request = useRef(0);
  useEffect(() => {
    let cancelled = false;
    request.current++;
    if (tab === "notas") loadReaderPersonal(target).then((value) => { if (!cancelled) setPersonal(value); }).catch(() => { if (!cancelled) setError("No se pudo cargar tu espacio privado. Reintenta."); });
    if (tab === "relaciones") loadReaderRelations(target).then((value) => { if (!cancelled) setRelations(value); }).catch(() => { if (!cancelled) setError("No se pudieron consultar las relaciones. Reintenta."); });
    return () => { cancelled = true; };
  }, [tab, target, reload]); // target is a serializable identity, not a cache key.
  const url = readerUrl(target.slug, target.versionId, target.stableKey);
  async function mutate(kind: "favorite" | "note" | "delete", id?: string) {
    const generation = request.current;
    setBusy(true); setError("");
    const form = new FormData();
    form.set("slug", target.slug); if (target.versionId) form.set("versionId", target.versionId); if (target.stableKey) form.set("stableKey", target.stableKey);
    try {
      if (kind === "favorite") await toggleFavorite(form);
      if (kind === "note") {
        form.set("content", draft); await createAnnotation(form);
        // A reader may continue writing while the previous note is being saved.
        if (drafts.get(draftKey) === draft) drafts.delete(draftKey);
        if (request.current === generation) setDraft((current) => current === draft ? "" : current);
      }
      if (kind === "delete" && id) { form.set("id", id); await deleteAnnotationAction(form); }
      if (request.current === generation) { setPersonal(undefined); setReload((n) => n + 1); }
    } catch { if (request.current === generation) setError("No se pudo guardar el cambio. Comprueba tu sesión y reintenta."); }
    finally { setBusy(false); }
  }
  return <div className="reader-context-content"><h2>Contexto</h2><p className="reader-context-title">{title}</p>
    <nav aria-label="Contenido del contexto" className="reader-context-tabs">{(["fuente", "relaciones", "notas", "cambios"] as const).map((key) => <button key={key} aria-pressed={tab === key} onClick={() => { setTab(key); if (key === "cambios") loadChanges(); }}>{{ fuente: "Fuente", relaciones: "Relaciones", notas: "Mis notas", cambios: "Cambios" }[key]}</button>)}</nav>
    {error && <p role="alert">{error} <button onClick={() => { setError(""); setReload((n) => n + 1); }}>Reintentar</button></p>}
    {tab === "fuente" && metadata}
    {tab === "relaciones" && <section><h3>Relaciones verificadas</h3>{!relations && !error && <p role="status">Cargando relaciones…</p>}{relations && <>
      {target.stableKey && <><h4>De este artículo</h4><RelationList relations={relations.filter((r) => r.ownStableKey === target.stableKey)} /></>}
      <h4>De la norma</h4><RelationList relations={relations.filter((r) => !r.ownStableKey)} />
    </>}</section>}
    {tab === "notas" && <section><h3>Tu espacio privado</h3>{!personal && !error && <p role="status">Cargando…</p>}{personal && (!personal.authenticated ? <p><a href={`/api/auth/signin?callbackUrl=${encodeURIComponent(url)}`}>Inicia sesión</a> para guardar esta versión y añadir notas privadas.</p> : <>
      <button className="reader-primary" disabled={busy} aria-pressed={personal.favorite} onClick={() => mutate("favorite")}>{personal.favorite ? "Quitar de favoritos" : "Guardar en favoritos"}</button>
      <form onSubmit={(event) => { event.preventDefault(); void mutate("note"); }}><label htmlFor="reader-note">Anotación privada</label><textarea id="reader-note" value={draft} maxLength={10000} required rows={5} onChange={(event) => { setDraft(event.target.value); drafts.set(draftKey, event.target.value); }} /><button disabled={busy || !draft.trim()} type="submit">Guardar nota</button></form>
      <p>Las notas se vinculan a esta versión y sólo tú puedes verlas.</p>
      <ul className="reader-notes">{personal.notes.map((note) => <li key={note.id}><p>{note.content}</p><time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString("es-CL")}</time><button disabled={busy} onClick={() => mutate("delete", note.id)}>Eliminar nota</button></li>)}</ul>
      {!personal.notes.length && <p>Aún no tienes notas aquí.</p>}
    </>)}</section>}
    {tab === "cambios" && <section><h3>Cambios de texto</h3>{changeControls}<p>Comparación con la versión publicada anterior. No determina por sí sola los efectos jurídicos.</p>{changesLoading ? <p role="status">Cargando comparación…</p> : changes === null ? <p>No hay una versión anterior publicada para comparar.</p> : changes ? <><p>{changes.from.label} → {changes.to.label}</p><a href={`/normas/${target.slug}/comparar?desde=${changes.from.id}&hasta=${changes.to.id}`}>Abrir comparación completa</a><ul>{changes.changes.filter((c) => c.kind !== "unchanged" && (!target.stableKey || c.key === target.stableKey)).map((c) => <li key={c.key}><a href={`/normas/${target.slug}/comparar?desde=${changes.from.id}&hasta=${changes.to.id}#cambio-${c.key}`}>{c.label} · {{ added: "Agregado", modified: "Modificado", removed: "Eliminado", unchanged: "Sin cambios" }[c.kind]}</a></li>)}</ul></> : <button onClick={loadChanges}>Consultar cambios</button>}</section>}
  </div>;
}

function RelationList({ relations }: { relations: ReaderRelation[] }) {
  return relations.length ? <ul className="reader-relations">{relations.map((relation) => <li key={relation.id}><p>{relation.direction === "incoming" ? "Desde" : "Hacia"} <a href={relation.href}>{relation.label}</a></p><p>{relation.type} · {relation.versionSpecific ? "Versión identificada" : "Relación general"}</p><details><summary>Evidencia</summary><p>{relation.evidence}</p>{relation.fragment && <blockquote>{relation.fragment}</blockquote>}</details></li>)}</ul> : <p>No hay relaciones verificadas disponibles para este ámbito.</p>;
}
