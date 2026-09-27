/** A reference identifies a document; it is never used as a user supplied fetch URL. */
export type BcnXmlReference = { kind: "idNorma" | "idLey"; value: string };

export class BcnReferenceError extends Error {
  constructor(message = "Indique un ID BCN, una ley (por ejemplo, Ley 19.880) o una URL LeyChile reconocida.") {
    super(message);
    this.name = "BcnReferenceError";
  }
}

export function validateBcnReference(reference: BcnXmlReference): BcnXmlReference {
  if (!reference || !["idNorma", "idLey"].includes(reference.kind) || typeof reference.value !== "string" || !/^[1-9]\d{0,11}$/.test(reference.value)) {
    throw new BcnReferenceError();
  }
  return { kind: reference.kind, value: reference.value };
}

export function bcnReferenceKey(reference: BcnXmlReference): string {
  const valid = validateBcnReference(reference);
  return `${valid.kind}:${valid.value}:latest:xml`;
}

export function parseBcnReference(input: string): BcnXmlReference {
  const value = input.trim();
  if (/^\d+$/.test(value)) return validateBcnReference({ kind: "idNorma", value });
  const explicit = value.match(/^(idNorma|idLey)\s*[:=]\s*(\d+)$/i);
  if (explicit) return validateBcnReference({ kind: explicit[1].toLowerCase() === "idley" ? "idLey" : "idNorma", value: explicit[2] });
  const law = value.match(/^ley\s*(?:(?:n[.°ºo]*|número)\s*)?(\d{1,3}(?:\.\d{3})+|\d+)$/i);
  if (law) return validateBcnReference({ kind: "idLey", value: law[1].replaceAll(".", "") });

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BcnReferenceError();
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/$/, "").toLowerCase();
  const allowedPath = ["www.leychile.cl", "leychile.cl", "nuevo.leychile.cl"].includes(host)
    ? ["/navegar", "/consulta/obtxml"].includes(path)
    : ["www.bcn.cl", "bcn.cl"].includes(host) && ["/leychile/navegar", "/leychile/consulta/obtxml"].includes(path);
  if (!allowedPath || !["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || url.hash) {
    throw new BcnReferenceError();
  }
  // Historical and part selectors must not silently become a request for the latest document.
  for (const [key, parameter] of url.searchParams) {
    if (!["idNorma", "idLey", "opt"].includes(key) || (key === "opt" && parameter !== "7")) {
      throw new BcnReferenceError("Esta URL incluye selectores no admitidos. El piloto recupera únicamente la versión actualizada por ID de norma o número de ley.");
    }
  }
  const norm = url.searchParams.getAll("idNorma");
  const lawIds = url.searchParams.getAll("idLey");
  if (norm.length + lawIds.length !== 1) throw new BcnReferenceError();
  return validateBcnReference({ kind: norm.length ? "idNorma" : "idLey", value: norm[0] ?? lawIds[0] });
}
