/** Fixture access is explicit, including when a production build is used for E2E. */
export function dataMode(): "production" | "demo" | "test" {
  const value = process.env.LEGISDATA_DATA_MODE ?? "production";
  if (!["production", "demo", "test"].includes(value)) throw new Error("INVALID_DATA_MODE");
  return value as "production" | "demo" | "test";
}
export function fixturesAllowed() { return dataMode() !== "production"; }
export function fixtureDataEnabled() {
  if (process.env.DATABASE_URL) return false;
  if (!fixturesAllowed()) throw new Error("DATABASE_UNAVAILABLE");
  return true;
}
