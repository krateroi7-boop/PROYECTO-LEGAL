import type { ContentBlock } from "@/domain/legislation/content";
import type { DocumentValidation } from "./document-validation";
export type SourceNode = {
  contentBlocks?: ContentBlock[];
  sourceMetadata?: Record<string, string | boolean | null>;
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
  identifiers?: { type: string; number: string }[];
  sourceMetadata?: Record<string, unknown>;
  attachments?: { name: string | null; mimeType: string | null; description: string | null; embedded: boolean }[];
  coverage?: { inputParts: number; representedParts: number; inputTexts: number; representedTexts: number; unsupported: string[] };
  validation?: DocumentValidation;
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
