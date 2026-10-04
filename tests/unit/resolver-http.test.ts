import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), ingest: vi.fn(), local: vi.fn(), selection: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/sources/ingestion-service", async (original) => ({ ...await original<typeof import("@/sources/ingestion-service")>(), readIngestionState: mocks.read, requestIngestion: mocks.ingest }));
vi.mock("@/search/hybrid", () => ({ findLocalExact: mocks.local }));
vi.mock("@/sources/metrics", () => ({ recordDiscoverySelection: mocks.selection }));
import { GET, POST } from "@/app/api/v1/resolver/route";
const state = { status: "not_requested", source: "bcn-leychile", reference: { kind: "idNorma", value: "172986" }, cache: "none", checkedAt: null };
const request = (body: unknown = { referencia: "idNorma:172986" }, origin = "https://legisdata.test") => new Request("https://legisdata.test/api/v1/resolver", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DATABASE_URL", "postgres://unused"); mocks.auth.mockResolvedValue(null); mocks.local.mockResolvedValue(undefined); mocks.read.mockResolvedValue(state); mocks.ingest.mockResolvedValue({ ...state, status: "pending_review" }); });
describe("resolver HTTP boundary", () => {
  it("GET reads state without initiating ingestion or selection writes", async () => {
    expect((await GET(new Request("https://legisdata.test/api/v1/resolver?referencia=idNorma:172986"))).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledOnce(); expect(mocks.ingest).not.toHaveBeenCalled(); expect(mocks.selection).not.toHaveBeenCalled();
  });
  it("rejects anonymous POST before database or source access", async () => {
    expect((await POST(request())).status).toBe(401); expect(mocks.ingest).not.toHaveBeenCalled(); expect(mocks.local).not.toHaveBeenCalled();
  });
  it("requires same-origin JSON and rejects forged actor fields", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "server-user" } });
    expect((await POST(request(undefined, "https://attacker.test"))).status).toBe(403);
    expect((await POST(request({ referencia: "idNorma:172986", actor: { kind: "system" } }))).status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("uses only the session actor and reuses published results without an acquisition", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "server-user", role: "user" } });
    expect((await POST(request())).status).toBe(202);
    expect(mocks.ingest.mock.calls[0][2]).toEqual({ kind: "account", account: { id: "server-user" } });
    mocks.ingest.mockClear(); mocks.local.mockResolvedValue({ resolution: { ...state, status: "published", slug: "codigo-civil" } });
    expect((await POST(request())).status).toBe(200); expect(mocks.ingest).not.toHaveBeenCalled();
  });
});
