import { cookies } from "next/headers";
import Link from "next/link";
import { readerDate } from "@/lib/reader/data";
import { buildReaderTree, readerHeading, readerUrl, type IndexBranch } from "@/lib/reader/structure";
import type { ReaderDocument, ReaderIndexNode } from "@/lib/reader/types";
import { ReaderController } from "./reader-controller";
import "./reader.css";

export async function LegalDocument({ document: doc }: { document: ReaderDocument }) {
  const jar = await cookies();
  const theme = jar.get("reader-theme")?.value ?? "system", size = Number(jar.get("reader-size")?.value ?? 18);
  const index: ReaderIndexNode[] = doc.nodes.map(({ stableKey, parentStableKey, type, label, title, position }) => ({ stableKey, parentStableKey, type, label, title, position }));
  const texts = new Map(doc.nodes.map((node) => [node.stableKey, node.text]));
  function renderNode(node: IndexBranch) {
    const Heading = `h${Math.min(node.depth + 2, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
    return <section key={node.stableKey} id={node.stableKey} data-reader-node data-node-type={node.type} className="reader-node">
      <div className="reader-node-heading"><Heading><a href={readerUrl(doc.slug, doc.version?.id, node.stableKey)} data-reader-text>{readerHeading(node)}</a></Heading><span data-change-badge className="reader-change-badge" />
        {["articulo", "disposicion_transitoria"].includes(node.type) && <button type="button" className="reader-article-menu" data-reader-action="menu" data-key={node.stableKey} aria-label={`Acciones de ${node.label}`} aria-haspopup="dialog">⋯</button>}
      </div>
      {(texts.get(node.stableKey) ?? "").split(/\n\s*\n/).filter(Boolean).map((text, position) => <p key={position} data-reader-text className="reader-legal-text">{text}</p>)}
      {node.children.map(renderNode)}
    </section>;
  }
  return <ReaderController key={`${doc.slug}/${doc.version?.id ?? "current"}`} slug={doc.slug} title={`${doc.type} ${doc.number} · ${doc.shortTitle}`} version={doc.version} versions={doc.versions} nodes={index} initialTheme={["system", "light", "dark"].includes(theme) ? theme : "system"} initialSize={[16, 18, 20, 22].includes(size) ? size : 18} metadata={<ReaderProvenance document={doc} />} navigation={<nav className="reader-brand-row" aria-label="Legisdata"><Link href="/" className="reader-brand">Legis<span>data</span></Link><Link href="/buscar">Buscar otra norma</Link><Link href="/cuenta">Mi cuenta</Link></nav>} header={<header className="reader-header">
    <div className="reader-title"><p className="reader-eyebrow">{doc.type} N.º {doc.number}</p><h1>{doc.title}</h1><div className="reader-header-meta"><span className="reader-status-chip" data-status={doc.status}>{doc.status === "Desconocida" ? "Vigencia no determinada" : doc.status}</span><span>Publicación: {doc.publicationDate}</span>{doc.organism && <span>{doc.organism}</span>}{doc.version && <span>{doc.version.label} · {doc.version.dateLabel}</span>}</div>{doc.demonstration && <p className="reader-demo">Contenido de demostración. No representa el texto oficial completo.</p>}</div>
  </header>}>
    <style>{`.legal-reader ::highlight(reader-matches) { color: #18242d; background: #ffe7a2; } .legal-reader ::highlight(reader-active) { color: #18242d; background: #f6b83a; }`}</style>
    {buildReaderTree(index).map(renderNode)}
    <noscript><p>El texto y sus enlaces están disponibles sin JavaScript. Actívalo para buscar, guardar y abrir las herramientas de contexto.</p></noscript>
    <div className="reader-source-inline"><ReaderProvenance document={doc} anchor /></div>
  </ReaderController>;
}

function ReaderProvenance({ document: doc, anchor = false }: { document: ReaderDocument; anchor?: boolean }) {
  return <section id={anchor ? "fuente" : undefined} className="reader-provenance"><h3>Fuente y procedencia</h3><dl>
    <dt>Norma</dt><dd>{doc.type} {doc.number}</dd><dt>Publicación</dt><dd>{doc.publicationDate}</dd><dt>Organismo</dt><dd>{doc.organism ?? "No informado"}</dd>
    <dt>Versión consultada</dt><dd>{doc.version?.label ?? "Versión publicada"}</dd><dt>Fecha de versión</dt><dd>{doc.version?.dateLabel ?? "No informada"}</dd><dt>Vigencia informada</dt><dd>{doc.status === "Desconocida" ? "No determinada" : doc.status}</dd>
    <dt>Fuente</dt><dd>{doc.provenance?.sourceName ?? (doc.demonstration ? "Demostración local" : "No informada")}</dd><dt>Captura del original</dt><dd>{doc.provenance?.capturedAt ? readerDate(doc.provenance.capturedAt) : "No informada"}</dd><dt>Última comprobación de esta representación</dt><dd>{doc.checkedAt ? readerDate(doc.checkedAt) : "No registrada"}</dd>
  </dl>{doc.officialUrl && <a href={doc.officialUrl} target="_blank" rel="noreferrer">Abrir fuente oficial ↗</a>}<p>La versión de consulta y su fecha de comprobación no acreditan por sí solas vigencia jurídica ni un historial completo.</p>{doc.provenance && <details><summary>Detalles técnicos</summary><dl><dt>Identificador de captura</dt><dd>{doc.provenance.sourceDocumentId ?? "No informado"}</dd><dt>Checksum</dt><dd>{doc.provenance.checksum ?? "No informado"}</dd><dt>Parser</dt><dd>{doc.provenance.parser ?? "No informado"}</dd></dl></details>}</section>;
}
