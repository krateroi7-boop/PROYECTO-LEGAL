import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ discover: vi.fn(), fetch: vi.fn(), import: vi.fn() }));
vi.mock("@/ingestion/sources/bcn-leychile/discovery", () => ({ discoverBcnNorms: mocks.discover }));
vi.mock("@/ingestion/sources/bcn-leychile/client", () => ({ fetchBcnNorm: mocks.fetch }));
vi.mock("@/ingestion/sources/bcn-leychile/import", () => ({ importBcnStaging: mocks.import }));
import { syncBcnNorms } from "@/ingestion/sources/bcn-leychile/sync";

const entry = { normId: "123", slug: "ley-123", type: "Ley", number: "123", title: "Norma de prueba", publishedAt: "2003-05-29T00:00:00.000Z" };
const raw = JSON.stringify({ html: [{ i: 10, t: '<div class="p">Artículo único. Regla. Texto de prueba.</div>' }] });
const capture = { raw, checksum: createHash("sha256").update(raw).digest("hex"), url: "https://example.test/norma", capturedAt: "2026-09-18T00:00:00.000Z" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.discover.mockResolvedValue({ supported: true, entries: [entry] });
  mocks.fetch.mockResolvedValue(capture);
});

describe("BCN explicit-list JSON synchronization", () => {
  it("retries database import after staging succeeded but the previous import failed", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "legisdata-sync-"));
    try {
      mocks.import.mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValueOnce({ status: "pending_review" }).mockResolvedValueOnce({ status: "skipped" });
      expect((await syncBcnNorms({ outputDir })).results[0].result).toBe("failed");
      mocks.fetch.mockResolvedValue({ ...capture, capturedAt: "2026-09-19T00:00:00.000Z" });
      expect((await syncBcnNorms({ outputDir })).results[0].result).toBe("changed_pending_review");
      expect((await syncBcnNorms({ outputDir })).results[0].result).toBe("skipped_unchanged");
      expect(mocks.import).toHaveBeenCalledTimes(3);
      expect(mocks.import.mock.calls[1][0]).toBe(mocks.import.mock.calls[0][0]);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("does not invent identity or publication dates when only an external ID was supplied", async () => {
    mocks.discover.mockResolvedValue({ supported: false, entries: [] });
    const result = await syncBcnNorms({ normIds: ["123"] });
    expect(result.results[0].error).toContain("requires local metadata");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.import).not.toHaveBeenCalled();
  });
});
