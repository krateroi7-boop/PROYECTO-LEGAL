import { getPersistedLaw, listPersistedLaws } from "@/db/repositories/laws";
import { searchPersisted } from "@/db/repositories/search";
import { getLaw as getFixtureLaw, laws as fixtureLaws, type Law } from "@/lib/legislation";

export async function listLaws(): Promise<Law[]> {
  if (!process.env.DATABASE_URL) return fixtureLaws;
  return listPersistedLaws();
}

export async function getLaw(slug: string): Promise<Law | undefined> {
  if (!process.env.DATABASE_URL) return getFixtureLaw(slug);
  return getPersistedLaw(slug);
}

export async function searchLaws(query: string): Promise<Law[]> {
  if (!process.env.DATABASE_URL) {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? fixtureLaws.filter((law) => [law.number, law.title, law.shortTitle, law.description, ...law.topics, ...law.articles.flatMap((article) => [article.number, article.title ?? "", ...article.paragraphs])].join(" ").toLowerCase().includes(normalized))
      : fixtureLaws;
  }
  const results = await searchPersisted({ q: query || undefined, limit: 20 });
  const uniqueSlugs = [...new Set(results.map((result) => result.norm.slug))];
  const laws = await Promise.all(uniqueSlugs.map((slug) => getPersistedLaw(slug)));
  return laws.filter((law): law is Law => Boolean(law));
}
