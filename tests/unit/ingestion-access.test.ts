import { afterEach, describe, expect, it, vi } from "vitest";
import { canReadPublishedNorm, canRequestIngestion } from "@/auth/ingestion-access";
import { fixtureDataEnabled } from "@/lib/data-mode";
import { sourcePublicationAllowed } from "@/ingestion/editorial/source-policy";
afterEach(() => vi.unstubAllEnvs());
describe("public reading and ingestion access are independent", () => {
  it("requires an account, allows an entitlement to deny it, and does not grant access by role", async () => {
    expect(await canRequestIngestion(null)).toBe(false);
    expect(await canRequestIngestion({ id: "account" })).toBe(true);
    expect(await canRequestIngestion({ id: "admin" }, () => false)).toBe(false);
    expect(canReadPublishedNorm({ publicationStatus: "published", sourceAllowed: true })).toBe(true);
    expect(canReadPublishedNorm({ publicationStatus: "pending_review", sourceAllowed: true })).toBe(false);
    expect(canReadPublishedNorm({ publicationStatus: "published", sourceAllowed: false })).toBe(false);
  });
  it("does not serve fixtures without an explicit mode, including missing DB production", () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("LEGISDATA_DATA_MODE", "production");
    expect(() => fixtureDataEnabled()).toThrow("DATABASE_UNAVAILABLE");
    const source = { sourceKey: null, sourceName: "Fixture", parser: "local-fixture-v1" };
    expect(sourcePublicationAllowed(source)).toBe(false);
    vi.stubEnv("LEGISDATA_DATA_MODE", "test");
    expect(fixtureDataEnabled()).toBe(true); expect(sourcePublicationAllowed(source)).toBe(true);
    expect(sourcePublicationAllowed({ ...source, parser: "unknown" })).toBe(false);
  });
});
