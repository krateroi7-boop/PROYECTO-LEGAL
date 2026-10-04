/** Capabilities are evidence records, not a promise that every provider has a uniform API. */
export const sourceRegistry = [
  {
    key: "bcn-leychile", name: "BCN LeyChile", editorialReviewRequired: "source_policy_and_integrity",
    capabilities: {
      document: { status: "documented", evidence: "https://www.leychile.cl/esquemas/accesoLeyesChilenas4.pdf" },
      metadata: { status: "experimental", evidence: "https://datos.bcn.cl/es/documentacion/consultas-sparql" },
      search: { status: "experimental", evidence: "https://datos.bcn.cl/es/documentacion/consultas-sparql" },
      versions: { status: "not_verified" },
      relations: { status: "experimental", evidence: "https://datos.bcn.cl/es/documentacion/normas" },
      changes: { status: "not_verified" },
    },
    limitation: "Resolución XML exacta y descubrimiento SPARQL selectivo. Los metadatos no acreditan exhaustividad, vigencia ni historial completo. Sus términos de reutilización no habilitan automáticamente el texto XML.",
    usage: "pending_review",
  },
  {
    key: "diario-oficial", name: "Diario Oficial", editorialReviewRequired: true,
    capabilities: { document: { status: "not_implemented" }, search: { status: "not_verified" }, changes: { status: "not_verified" } },
    limitation: "Publicaciones originales por CVE; no equivale a textos consolidados. Conector pendiente de implementación.",
    usage: "pending_review",
    evidence: "https://www.diariooficial.interior.gob.cl/condiciones/",
  },
] as const;
