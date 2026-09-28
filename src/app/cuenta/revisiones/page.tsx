import Link from "next/link";
import { requireUser } from "@/auth/guards";
import { listReviewRequests } from "@/db/repositories/review-requests";

export default async function ReviewRequestsPage() {
  const actor = await requireUser("/cuenta/revisiones");
  const requests = await listReviewRequests(actor.id);
  const labels: Record<string, string> = { pending_review: "Pendiente de revisión", approved: "Revisión aprobada; publicación pendiente", published: "Publicado", rejected: "Revisión rechazada" };
  return <main className="mx-auto max-w-4xl px-6 py-12 text-[#192231]"><Link href="/cuenta" className="underline">Mi cuenta</Link><h1 className="mt-6 text-3xl font-bold text-[#173f6b]">Mis solicitudes de revisión</h1><p className="mt-4">El estado corresponde a la propuesta editorial solicitada. La publicación también requiere habilitación de la fuente.</p>
    {requests.length ? requests.map((request) => <article key={request.id} className="mt-5 rounded border bg-white p-5"><h2 className="font-bold">{request.title ?? "Propuesta editorial"}</h2><p className="mt-2">{labels[request.status] ?? "En proceso editorial"}</p><p className="mt-2 text-sm">Solicitada el {request.createdAt.toLocaleString("es-CL", { timeZone: "America/Santiago" })}</p></article>) : <p className="mt-6">Todavía no ha solicitado revisiones.</p>}
  </main>;
}
