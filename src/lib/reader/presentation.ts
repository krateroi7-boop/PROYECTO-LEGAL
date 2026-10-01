/** Public wording is derived from dates and flags, never from an internal versionLabel. */
export function presentVersion(version: { isCurrent: boolean; validFrom?: Date | string | null; sourceVersionDate?: Date | string | null }) {
  const sourceOnly = !version.validFrom && Boolean(version.sourceVersionDate);
  const date = version.sourceVersionDate ?? version.validFrom;
  return {
    label: sourceOnly ? "Versión informada por la fuente" : version.isCurrent ? "Versión de consulta actual" : "Versión histórica",
    dateLabel: date ? `${version.sourceVersionDate ? "Fecha declarada por la fuente: " : ""}${readerDate(date)}` : "Fecha de versión no informada",
  };
}

export function readerDate(date: Date | string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "Fecha no informada" : parsed.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
