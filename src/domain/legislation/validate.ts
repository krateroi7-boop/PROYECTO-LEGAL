import { legislationFixtureSchema, type LegislationFixture } from "./fixture-schema";

export function validateFixture(input: unknown): LegislationFixture {
  const fixture = legislationFixtureSchema.parse(input);
  const seenSlugs = new Set<string>();
  const seenNumbers = new Set<string>();

  for (const law of fixture.laws) {
    if (seenSlugs.has(law.slug)) throw new Error(`Duplicate norm slug: ${law.slug}`);
    if (seenNumbers.has(`${law.type}:${law.number}`)) throw new Error(`Duplicate norm number: ${law.type} ${law.number}`);
    seenSlugs.add(law.slug);
    seenNumbers.add(`${law.type}:${law.number}`);

    const articleIds = new Set<string>();
    law.articles.forEach((article, index) => {
      if (articleIds.has(article.id)) throw new Error(`Duplicate article id in ${law.slug}: ${article.id}`);
      if (article.id !== `articulo-${index + 1}`) throw new Error(`Article order must be contiguous in ${law.slug}`);
      articleIds.add(article.id);
    });
  }
  return fixture;
}
