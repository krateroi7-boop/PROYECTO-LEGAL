import Link from "next/link";
import { requireUser } from "@/auth/guards";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#192231]">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link href="/" className="text-sm font-semibold text-[#526174]">← Volver a Legisdata</Link>
        <div className="mt-8 rounded-2xl border border-[#e2e6eb] bg-white p-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d37d42]">Mi cuenta</p>
          <h1 className="mt-3 text-3xl font-bold text-[#173f6b]">{user.name ?? "Usuario"}</h1>
          <p className="mt-2 text-sm text-[#697789]">{user.email ?? "Cuenta OIDC"}</p>
          {user.role && user.role !== "user" ? <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#d37d42]">Rol: {user.role}</p> : null}
          <div className="mt-8 grid gap-3 sm:grid-cols-2"><Link href="/cuenta/favoritos" className="rounded-xl border border-[#e2e6eb] p-5 font-semibold text-[#173f6b] hover:bg-[#f8fafb]">Mis favoritos →</Link><Link href="/cuenta/notas" className="rounded-xl border border-[#e2e6eb] p-5 font-semibold text-[#173f6b] hover:bg-[#f8fafb]">Mis notas privadas →</Link></div>
        </div>
      </div>
    </main>
  );
}
