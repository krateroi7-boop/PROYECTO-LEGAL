/** Capabilities are evidence records, not a promise that every provider has a uniform API. */
export const sourceRegistry = [
  {
    key: "bcn-leychile", name: "BCN LeyChile", editorialReviewRequired: true,
    capabilities: {
      document: { status: "documented", evidence: "https://www.leychile.cl/esquemas/accesoLeyesChilenas4.pdf" },
      metadata: { status: "experimental", evidence: "https://datos.bcn.cl/es/documentacion/consultas-sparql" },
      search: { status: "not_verified" },
      versions: { status: "not_verified" },
      relations: { status: "experimental", evidence: "https://datos.bcn.cl/es/documentacion/normas" },
      changes: { status: "not_verified" },
    },
    limitation: "Consulta exacta por ID, número de ley o URL. La cobertura y actualidad de SPARQL deben validarse separadamente.",
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
