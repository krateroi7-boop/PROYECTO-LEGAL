import { fixtureDataEnabled } from "@/lib/data-mode";
import { getPersistedLaw, listPersistedLawSummaries, type LawSummary } from "@/db/repositories/laws";
import { searchPersisted } from "@/db/repositories/search";
import { getLaw as getFixtureLaw, laws as fixtureLaws, type Law } from "@/lib/legislation";

export async function listLaws(): Promise<LawSummary[]> {
  if (fixtureDataEnabled()) return fixtureLaws.map(summarizeFixture);
  return listPersistedLawSummaries();
}

export async function getLaw(slug: string): Promise<Law | undefined> {
  if (fixtureDataEnabled()) return getFixtureLaw(slug);
  return getPersistedLaw(slug);
}

export async function searchLaws(query: string): Promise<LawSummary[]> {
  if (fixtureDataEnabled()) {
    const normalized = query.trim().toLowerCase();
    return (normalized
      ? fixtureLaws.filter((law) => [law.number, law.title, law.shortTitle, law.description, ...law.topics, ...law.articles.flatMap((article) => [article.number, article.title ?? "", ...article.paragraphs])].join(" ").toLowerCase().includes(normalized))
      : fixtureLaws).map(summarizeFixture);
  }
  const results = await searchPersisted({ q: query || undefined, limit: 20 });
  const uniqueSlugs = [...new Set(results.map((result) => result.norm.slug))];
  const summaries = await listPersistedLawSummaries(uniqueSlugs);
  return uniqueSlugs.flatMap((slug) => summaries.filter((law) => law.slug === slug));
}
function summarizeFixture(law: Law): LawSummary {
  const { articles, ...summary } = law;
  return { ...summary, articleCount: articles.filter((node) => !node.type || ["articulo", "disposicion_transitoria"].includes(node.type)).length };
}
export async function getLawSummary(slug: string): Promise<LawSummary | undefined> {
  if (fixtureDataEnabled()) { const law = getFixtureLaw(slug); return law ? summarizeFixture(law) : undefined; }
  return (await listPersistedLawSummaries([slug]))[0];
}
