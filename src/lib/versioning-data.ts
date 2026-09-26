import { getLaw } from "@/lib/legislation";
import type { LawVersion } from "@/domain/versioning/types";

const current = getLaw("ley-19880")!;
const historical: LawVersion = {
  id: "ley-19880-2003",
  label: "Texto original",
  validFrom: "29 de mayo de 2003",
  isCurrent: false,
  law: {
    ...current,
    updated: "Texto original publicado el 29 de mayo de 2003",
    articles: current.articles.filter((article) => article.id !== "articulo-4").map((article) =>
      article.id === "articulo-3"
        ? { ...article, paragraphs: ["El procedimiento administrativo estará sometido a los principios de escrituración, gratuidad, celeridad y economía procedimental."] }
        : article,
    ),
  },
};

const currentVersion: LawVersion = {
  id: "ley-19880-2024",
  label: "Texto vigente",
  validFrom: "20 de junio de 2024",
  isCurrent: true,
  law: current,
};

const versions: Record<string, LawVersion[]> = {
  "ley-19880": [historical, currentVersion],
};

export function getVersions(slug: string) {
  return versions[slug] ?? [];
}

export function getVersion(slug: string, versionId: string) {
  return getVersions(slug).find((version) => version.id === versionId);
}

export function getCurrentVersion(slug: string) {
  return getVersions(slug).find((version) => version.isCurrent) ?? getVersions(slug)[0];
}
