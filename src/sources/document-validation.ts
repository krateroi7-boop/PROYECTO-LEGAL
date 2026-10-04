import { contentText } from "@/domain/legislation/content";
import type { SourceDocument, SourceReference } from "./types";
export type ValidationIssue = { rule: string; severity: "error" | "warning" | "info"; message: string };
export type DocumentValidation = { schema: "document-validation-v1"; complete: boolean; issues: ValidationIssue[] };
/** Technical failures cannot be waived by marking an editorial validation row resolved. */
export function validateSourceDocument(document: SourceDocument, reference?: SourceReference, previous?: SourceDocument | null): DocumentValidation {
  const issues: ValidationIssue[] = [];
  const error = (rule: string) => issues.push({ rule, severity: "error", message: rule });
  if (!/^[1-9]\d{0,11}$/.test(document.sourceIdentifier) || !document.title || !document.type || !document.number) error("essential-identity");
  if (reference?.kind === "idNorma" && reference.value !== document.sourceIdentifier) error("requested-identity-mismatch");
  if (reference?.kind === "idLey" && (document.type.toLowerCase() !== "ley" || document.number.replace(/\./g, "") !== reference.value)) error("requested-law-mismatch");
  for (const [name, value] of [["publication", document.publishedAt], ["version", document.versionDate]]) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) error(`invalid-or-missing-${name}-date`);
  }
  if (document.versionDate && document.versionDate > new Date().toISOString().slice(0, 10)) issues.push({ rule: "future-source-version-date", severity: "warning", message: "La fuente declara una fecha de versión futura; requiere revisión y no acredita vigencia." });
  if (document.versionDate && document.publishedAt && document.versionDate < document.publishedAt) error("version-before-publication");
  const seen = new Set<string>();
  for (const [index, node] of document.nodes.entries()) {
    if (seen.has(node.stableKey)) error("duplicate-node-key");
    // A parent must precede a child. This also rules out every cycle, including disconnected cycles.
    if (node.parentStableKey && !seen.has(node.parentStableKey)) error("invalid-parent-or-cycle");
    if (node.position !== index) error("noncanonical-node-order");
    if (node.contentBlocks && contentText(node.contentBlocks).trim() !== node.text) error("block-text-mismatch");
    seen.add(node.stableKey);
  }
  if (!document.nodes.length) error("empty-document");
  const coverage = document.coverage;
  if (!coverage) error("missing-independent-coverage");
  else {
    if (coverage.inputParts !== document.nodes.length || coverage.representedParts !== coverage.inputParts || coverage.inputTexts !== coverage.representedTexts) error("incomplete-coverage");
    if (coverage.unsupported.length) error("unsupported-content");
  }
  if (document.attachments?.length) error("unrepresented-attachments");
  for (const warning of document.warnings) {
    if (["missing-title", "missing-publication-date", "missing-version-date"].includes(warning)) error(warning);
    else issues.push({ rule: warning, severity: "warning", message: warning });
  }
  if (previous) {
    if (previous.versionDate && document.versionDate && previous.versionDate > document.versionDate) error("version-date-regression");
    if (previous.nodes.some((node) => !seen.has(node.stableKey))) issues.push({ rule: "removed-structures", severity: "warning", message: "Hay estructuras anteriores ausentes; requiere revisión editorial." });
  }
  if (!issues.length) issues.push({ rule: "integrity", severity: "info", message: "Identidad, jerarquía y cobertura verificadas." });
  return { schema: "document-validation-v1", complete: !issues.some((issue) => issue.severity === "error"), issues };
}
