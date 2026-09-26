export type SearchInput = {
  q?: string;
  number?: string;
  article?: string;
  type?: string;
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  norm: { slug: string; number: string; title: string; type: string };
  node?: { stableKey: string; label: string };
  versionId: string;
  highlight: string;
  rank: number;
};
