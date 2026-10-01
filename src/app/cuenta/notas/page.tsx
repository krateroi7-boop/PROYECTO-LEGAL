import Link from "next/link";
import { requireUser } from "@/auth/guards";
import { listAnnotations } from "@/db/repositories/users";
import { deleteAnnotationAction } from "@/app/actions/personal";

export default async function NotesPage() {
  const user = await requireUser();
  const notes = process.env.DATABASE_URL ? await listAnnotations(user.id!) : [];
  return <main className="min-h-screen bg-[#f6f7f9] px-6 py-12 text-[#192231]"><div className="mx-auto max-w-4xl"><Link href="/cuenta" className="text-sm font-semibold text-[#526174]">← Mi cuenta</Link><h1 className="mt-6 text-3xl font-bold text-[#173f6b]">Notas privadas</h1>{notes.length ? <div className="mt-6 space-y-3">{notes.map((note) => <article key={note.id} className="rounded-xl border border-[#e2e6eb] bg-white p-5">{note.context ? <><h2 className="font-semibold text-[#173f6b]">{note.context.name}</h2><p className="mt-1 text-sm text-[#526174]">{note.context.article ?? note.context.title}</p>{note.context.version && <p className="mt-1 text-xs text-[#526174]">{note.context.version.label} · {note.context.version.dateLabel}</p>}</> : <p className="text-sm text-[#526174]">La publicación vinculada ya no está disponible. Tu nota sigue siendo privada.</p>}<p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-[#526174]">{note.content}</p><div className="mt-3 flex items-center justify-between gap-4">{note.context ? <Link className="text-sm text-[#173f6b] underline" href={note.context.href}>{note.context.article ? "Abrir artículo" : "Abrir norma"}</Link> : <span className="text-xs text-[#526174]">Nota privada</span>}<form action={deleteAnnotationAction}><input type="hidden" name="id" value={note.id} /><button type="submit" className="text-xs font-semibold text-[#a34d3c] hover:underline">Eliminar</button></form></div></article>)}</div> : <p className="mt-6 rounded-xl border border-dashed border-[#cbd5df] bg-white p-8 text-sm text-[#697789]">Todavía no tienes notas privadas.</p>}</div></main>;
}
