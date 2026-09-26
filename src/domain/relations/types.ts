export const relationTypes = ["modifica", "deroga", "reemplaza", "cita", "remite", "reglamenta", "complementa", "relacionada"] as const;
export type RelationType = (typeof relationTypes)[number];
export type RelationStatus = "pending" | "verified" | "rejected";

export type LegalRelation = {
  id: string;
  sourceSlug: string;
  sourceLabel: string;
  targetSlug: string;
  targetLabel: string;
  type: RelationType;
  status: RelationStatus;
  evidence: string;
  method: "manual" | "parser" | "import";
};
