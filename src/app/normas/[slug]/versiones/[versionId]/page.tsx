import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/reader/legal-document";
import { getReaderDocument } from "@/lib/reader/data";

export const dynamic = "force-dynamic";

export default async function HistoricalVersionPage({ params }: { params: Promise<{ slug: string; versionId: string }> }) {
  const { slug, versionId } = await params;
  const document = await getReaderDocument(slug, versionId);
  if (!document) notFound();
  return <LegalDocument document={document} />;
}
