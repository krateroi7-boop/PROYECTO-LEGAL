import type { ArticleDto, ProvenanceDto } from "@/api/contracts";
import type { ChangeKind } from "@/domain/versioning/types";
import type { RelationType } from "@/domain/relations/types";

export type ReaderVersion = { id: string; label: string; isCurrent: boolean; dateLabel: string; validFrom: string | null; validTo: string | null; sourceVersionDate: string | null };
export type ReaderNode = ArticleDto;
export type ReaderIndexNode = Pick<ReaderNode, "stableKey" | "parentStableKey" | "type" | "label" | "title" | "position">;
export type ReaderDocument = {
  id?: string; slug: string; type: string; number: string; title: string; shortTitle: string;
  status: string; publicationDate: string; description: string; topics: string[];
  version?: ReaderVersion; versions: ReaderVersion[]; nodes: ReaderNode[];
  provenance?: ProvenanceDto; organism?: string; checkedAt?: string; officialUrl?: string; demonstration: boolean;
};
export type ReaderRelation = { id: string; type: RelationType; direction: "outgoing" | "incoming"; label: string; href: string; evidence: string; fragment?: string; ownStableKey?: string; versionSpecific: boolean };
export type ReaderChanges = { from: ReaderVersion; to: ReaderVersion; changes: { key: string; label: string; kind: ChangeKind }[] };
export type ReaderPersonal = { authenticated: boolean; favorite: boolean; notes: { id: string; content: string; updatedAt: string }[] };
export type ReaderTarget = { slug: string; versionId?: string; stableKey?: string };
