import { normalizedLegalDocumentSchema, type NormalizedLegalDocument } from "./normalizer";

export type BcnValidationReport = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  counts: { articles: number; references: number };
};

export function validateNormalizedBcnDocument(document: NormalizedLegalDocument): BcnValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const keys = new Set<string>();
  for (const node of document.nodes) {
    if (keys.has(node.stableKey)) errors.push(`Duplicate stable key: ${node.stableKey}`);
    keys.add(node.stableKey);
    if (!node.text.trim()) warnings.push(`Empty text: ${node.stableKey}`);
  }
  if (document.references.some((reference) => !keys.has(reference.sourceStableKey))) {
    errors.push("Reference points to an unknown source node.");
  }
  normalizedLegalDocumentSchema.parse(document);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    counts: { articles: document.nodes.length, references: document.references.length },
  };
}
