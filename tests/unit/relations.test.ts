import { describe, expect, it } from "vitest";
import { validateRelation } from "@/domain/relations/validate";
import type { LegalRelation } from "@/domain/relations/types";

const relation: LegalRelation = {
  id: "relation-1",
  sourceSlug: "ley-a",
  sourceLabel: "Ley A",
  targetSlug: "ley-b",
  targetLabel: "Ley B",
  type: "modifica",
  status: "verified",
  evidence: "Artículo 1 modifica la Ley B.",
  method: "manual",
};

describe("validateRelation", () => {
  it("accepts a verified relation with evidence", () => {
    expect(validateRelation(relation)).toEqual(relation);
  });

  it("rejects self-references and empty evidence", () => {
    expect(() => validateRelation({ ...relation, targetSlug: relation.sourceSlug })).toThrow("same norm");
    expect(() => validateRelation({ ...relation, evidence: " " })).toThrow("evidence");
  });
});
