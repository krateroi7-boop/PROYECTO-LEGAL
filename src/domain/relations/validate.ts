import { relationTypes, type LegalRelation } from "./types";

export function validateRelation(relation: LegalRelation) {
  if (!relation.sourceSlug || !relation.targetSlug) throw new Error("A relation requires source and target.");
  if (relation.sourceSlug === relation.targetSlug) throw new Error("A relation cannot target the same norm.");
  if (!relationTypes.includes(relation.type)) throw new Error(`Unsupported relation type: ${relation.type}`);
  if (!relation.evidence.trim()) throw new Error("A relation requires evidence.");
  return relation;
}
