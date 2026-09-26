export type BcnHtmlNode = {
  t?: string;
  i?: number;
  v?: string[];
  h?: BcnHtmlNode[];
};

export type BcnNormResponse = {
  html?: BcnHtmlNode[];
};

export type BcnPilotMetadata = {
  normId: string;
  slug: string;
  number: string;
  title: string;
  publishedAt: string;
  sourceUrl: string;
  capturedAt: string;
};

export type BcnStagingArticle = {
  id: string;
  number: string;
  title?: string;
  paragraphs: string[];
  sourcePartId?: number;
  sourceFlags: string[];
};

export type BcnStagingSnapshot = {
  source: {
    name: "BCN LeyChile";
    url: string;
    capturedAt: string;
    checksum: string;
    parser: "bcn-leychile-json-v1";
  };
  norm: BcnPilotMetadata;
  articles: BcnStagingArticle[];
};
