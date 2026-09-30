import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/reader/legal-document";
import { getReaderDocument } from "@/lib/reader/data";

export const dynamic = "force-dynamic";

export default async function LawPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = await getReaderDocument(slug);
  if (!document) notFound();
  return <LegalDocument document={document} />;
}
