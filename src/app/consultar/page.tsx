import Link from "next/link";
import { bcnConnector } from "@/sources/bcn";
import { parseDiscoveryQuery } from "@/sources/discovery-query";
import { findLocalExact } from "@/search/hybrid";
import { readSourceResolution } from "@/sources/resolver";
import { recordDiscoverySelection } from "@/sources/metrics";
import { ResolutionPanel } from "@/components/legal/resolution-panel";
import { DiscoveryResults } from "@/components/legal/discovery-results";

export default async function ConsultPage({ searchParams }: { searchParams: Promise<{ q?: string; referencia?: string; discovery?: string }> }) {
  const params = await searchParams;
  const input = typeof params.q === "string" ? params.q : typeof params.referencia === "string" ? params.referencia : "";
  let reference;
  let error = "";
  if (input) {
    try {
      if (input.length > 500) throw new Error("invalid");
      reference = params.q !== undefined ? parseDiscoveryQuery(input).reference : bcnConnector.parseReference(input);
      if (params.q === undefined && !reference) throw new Error("invalid");
    } catch { error = "Indique un número de ley, un título o una URL LeyChile reconocida. Por ejemplo: Ley 19.880."; }
  }
  let known;
  if (reference && !error) {
    if (!process.env.DATABASE_URL) error = "La consulta de fuentes externas no está disponible en esta instancia.";
    else {
      try {
        known = await findLocalExact(reference) ?? await readSourceResolution(bcnConnector, reference);
        if (params.discovery && reference.kind === "idNorma") await recordDiscoverySelection(params.discovery, reference.value);
      } catch { error = "No fue posible consultar la persistencia. Inténtelo nuevamente más tarde."; }
    }
  }
  return <main className="min-h-screen bg-[#f6f7f9] px-6 py-10 text-[#192231]"><div className="mx-auto max-w-3xl">
    <Link href="/" className="font-bold text-[#173f6b]">Legisdata</Link>
    <h1 className="mt-10 text-3xl font-bold text-[#173f6b]">Consultar una norma en BCN</h1>
    <p className="mt-4 leading-7 text-[#526174]">Escriba un número de ley, su título o un enlace de LeyChile. También puede usar un nombre habitual, como Ley de transparencia.</p>
    <form className="mt-6 flex flex-wrap gap-3"><label className="w-full text-sm font-semibold" htmlFor="consulta">Ley, ID BCN o enlace</label><input id="consulta" name="q" defaultValue={input} maxLength={500} required placeholder="Ley 19.880 o procedimiento administrativo" className="min-w-0 flex-1 rounded-lg border bg-white px-4 py-3" /><button className="rounded-lg bg-[#173f6b] px-5 py-3 font-bold text-white">Consultar</button></form>
    <p className="mt-2 text-xs text-[#697789]">Un número aislado se interpreta como número de ley. Para un identificador técnico use idNorma:210676.</p>
    {error ? <p role="alert" className="mt-6 rounded-xl bg-white p-6 text-[#a94c4c]">{error}</p> : null}
    {!error && reference ? <ResolutionPanel reference={reference} initial={known?.resolution} refresh={known ? !known.fresh : false} discoveryId={params.discovery} /> : null}
    {!error && input && !reference ? <DiscoveryResults query={input} /> : null}
    <p className="mt-8 text-sm text-[#697789]">Para consultar también las publicaciones locales, use el <Link href="/buscar" className="underline">buscador de Legisdata</Link>.</p>
  </div></main>;
}
