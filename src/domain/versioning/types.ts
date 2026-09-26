import type { Article, Law } from "@/lib/legislation";

export type LawVersion = {
  id: string;
  label: string;
  validFrom: string;
  validTo?: string;
  isCurrent: boolean;
  law: Law;
};

export type ChangeKind = "added" | "removed" | "modified" | "unchanged";

export type ArticleChange = {
  key: string;
  kind: ChangeKind;
  before?: Article;
  after?: Article;
};

export type VersionComparison = {
  from: LawVersion;
  to: LawVersion;
  changes: ArticleChange[];
  summary: Record<ChangeKind, number>;
};
