import Link from "next/link";
import { listLaws } from "@/lib/legislation-data";

export default async function Home() {
  const laws = await listLaws();
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#192231]">
      <header className="border-b border-[#dfe4eb] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173f6b] text-sm font-bold text-white">L</span><span className="text-lg font-bold tracking-tight">Legis<span className="text-[#d37d42]">data</span></span></Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-[#526174] md:flex"><a href="#normas" className="hover:text-[#173f6b]">Explorar normas</a><a href="#como-funciona" className="hover:text-[#173f6b]">Cómo funciona</a></nav>
          <Link href="/api/auth/signin" className="rounded-lg border border-[#dfe4eb] px-4 py-2 text-sm font-semibold text-[#526174]">Acceder</Link>
        </div>
      </header>
      <section className="border-b border-[#dfe4eb] bg-white">
        <div className="mx-auto max-w-7xl px-6 pb-20 pt-16 lg:px-10 lg:pb-28 lg:pt-24">
          <div className="max-w-3xl">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-[#d37d42]">Legislación chilena, mejor conectada</p>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-[-0.04em] text-[#173f6b] md:text-6xl">Encuentra la norma.<br /><span className="text-[#d37d42]">Entiende el contexto.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#697789]">Una nueva forma de consultar leyes y normas: estructuradas, navegables y conectadas para que encuentres exactamente lo que necesitas.</p>
            <form action="/buscar" className="mt-9 flex max-w-2xl overflow-hidden rounded-xl border border-[#cbd5df] bg-white p-1.5 shadow-[0_10px_30px_rgba(22,45,72,0.08)]"><input name="q" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[#9ca8b6]" placeholder="Buscar leyes, artículos, materias o conceptos" /><button className="rounded-lg bg-[#173f6b] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#245683]">Buscar</button></form>
          </div>
          <div className="mt-12 flex flex-wrap gap-3 text-sm"><span className="mr-2 py-2 font-semibold text-[#8792a2]">Explorar por:</span>{["Leyes", "Decretos", "Constitución", "Temas", "Cambios recientes"].map((item) => <a key={item} href="#normas" className="rounded-full border border-[#dfe4eb] bg-[#f8fafb] px-4 py-2 font-semibold text-[#526174] hover:border-[#aebdca] hover:text-[#173f6b]">{item}</a>)}</div>
        </div>
      </section>
      <section id="normas" className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="mb-8 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d37d42]">Biblioteca jurídica</p><h2 className="mt-2 text-2xl font-bold text-[#173f6b]">Normas destacadas</h2></div><span className="text-sm font-semibold text-[#8792a2]">{laws.length} normas disponibles</span></div>
        <div className="grid gap-4 md:grid-cols-3">{laws.map((law) => <Link href={`/normas/${law.slug}`} key={law.slug} className="group rounded-2xl border border-[#e2e6eb] bg-white p-6 transition hover:-translate-y-1 hover:border-[#b8c7d4] hover:shadow-[0_12px_30px_rgba(22,45,72,0.08)]"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[0.14em] text-[#d37d42]">{law.type} {law.number}</span><span className="rounded-full bg-[#e8f4ed] px-2.5 py-1 text-[11px] font-bold text-[#398264]">{law.status}</span></div><h3 className="mt-5 text-lg font-bold leading-7 text-[#173f6b] group-hover:text-[#245683]">{law.shortTitle}</h3><p className="mt-3 line-clamp-3 text-sm leading-6 text-[#697789]">{law.description}</p><div className="mt-6 flex items-center justify-between border-t border-[#edf0f3] pt-4 text-xs font-semibold text-[#8792a2]"><span>{law.articles.length} artículos</span><span className="text-[#d37d42]">Leer norma →</span></div></Link>)}</div>
      </section>
      <section id="como-funciona" className="border-y border-[#dfe4eb] bg-[#eef4f8]"><div className="mx-auto grid max-w-7xl gap-8 px-6 py-14 md:grid-cols-3 lg:px-10"><div><span className="text-2xl font-bold text-[#d37d42]">01</span><h3 className="mt-3 font-bold text-[#173f6b]">Datos estructurados</h3><p className="mt-2 text-sm leading-6 text-[#697789]">Cada norma se organiza por títulos, capítulos y artículos, no como un documento aislado.</p></div><div><span className="text-2xl font-bold text-[#d37d42]">02</span><h3 className="mt-3 font-bold text-[#173f6b]">Contexto conectado</h3><p className="mt-2 text-sm leading-6 text-[#697789]">Navega entre versiones, referencias y relaciones para comprender la historia de una norma.</p></div><div><span className="text-2xl font-bold text-[#d37d42]">03</span><h3 className="mt-3 font-bold text-[#173f6b]">Hecho para la web</h3><p className="mt-2 text-sm leading-6 text-[#697789]">URLs permanentes, lectura cómoda y una experiencia accesible desde cualquier dispositivo.</p></div></div></section>
      <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-sm text-[#8792a2] md:flex-row md:items-center md:justify-between lg:px-10"><span>Legisdata · Prototipo de plataforma jurídica</span><span>Diseñada para Chile · Datos de referencia</span></footer>
    </main>
  );
}
