export type SourceNode = {
  stableKey: string;
  sourcePartId: string | null;
  type: "titulo" | "capitulo" | "parrafo" | "articulo" | "inciso" | "disposicion_transitoria" | "encabezado" | "promulgacion" | "anexo" | "agrupador";
  label: string;
  title: string | null;
  text: string;
  position: number;
  parentStableKey: string | null;
};

export type SourceDocument = {
  sourceIdentifier: string;
  type: string;
  number: string;
  title: string;
  publishedAt: string | null;
  versionDate: string | null;
  status: "vigente" | "modificada" | "derogada" | "desconocida";
  sourceStatus: string | null;
  organisms: string[];
  nodes: SourceNode[];
  warnings: string[];
};

export type SourceReference = { kind: "idNorma" | "idLey"; value: string };
export type SourceValidators = { etag?: string | null; lastModified?: string | null };
export type SourceFetch = SourceValidators & {
  kind: "modified" | "not-modified";
  url: string;
  capturedAt: string;
  raw?: string;
  checksum?: string;
};

export interface LegalSourceConnector {
  key: string;
  name: string;
  parserVersion: string;
  parseReference(input: string): SourceReference | null;
  fetch(reference: SourceReference, validators: SourceValidators): Promise<SourceFetch>;
  normalize(raw: string, observation: { url: string; capturedAt: string; checksum: string }): SourceDocument;
}
