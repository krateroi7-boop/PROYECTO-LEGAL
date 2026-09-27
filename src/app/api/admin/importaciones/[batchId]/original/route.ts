import { z } from "zod";
import { requireRole } from "@/auth/guards";
import { getEditorialDetail } from "@/lib/editorial-detail";
import { FilesystemRawStorage } from "@/ingestion/storage/filesystem";

export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  await requireRole(["reviewer", "admin"]);
  const parsed = z.string().uuid().safeParse((await params).batchId);
  if (!parsed.success) return new Response(null, { status: 404 });
  const detail = await getEditorialDetail(parsed.data);
  const key = detail?.source.originalObjectKey ?? detail?.source.storageKey;
  if (!detail || !key) return new Response("Original no disponible.", { status: 404 });
  try {
    const original = await new FilesystemRawStorage().get(key);
    if (original.checksum !== detail.source.checksum) return new Response("La evidencia no coincide con su checksum.", { status: 409 });
    return new Response(original.content, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="fuente-${parsed.data}.txt"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("No fue posible recuperar el original conservado.", { status: 503 }); }
}
