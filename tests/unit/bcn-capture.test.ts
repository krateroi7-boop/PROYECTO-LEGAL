import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureBcnNorm } from "@/ingestion/sources/bcn-leychile/capture";

const metadata = {
  normId: "210676",
  slug: "ley-19880",
  number: "19.880",
  title: "Ley de prueba BCN",
  publishedAt: "2003-05-29T00:00:00.000Z",
  sourceUrl: "https://www.bcn.cl/leychile/navegar?idNorma=210676",
  capturedAt: "2026-09-18T00:00:00.000Z",
};

const responseBody = JSON.stringify({
  html: [{
    h: [{
      t: "<div><div class=\"p\">Artículo 1°. Aplicación. Texto de prueba.</div></div>",
      i: 101,
    }],
  }],
});

describe("BCN staging capture", () => {
  it("writes immutable captures and reuses an identical capture", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "legisdata-bcn-"));
    try {
      const result = await captureBcnNorm({
        metadata,
        outputDir,
        endpoint: "https://example.test/norma",
        fetchImpl: async () => new Response(responseBody, { status: 200 }),
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as { articleCount: number; source: { checksum: string } };
      expect(manifest.articleCount).toBe(1);
      expect(manifest.source.checksum).toBe(result.snapshot.source.checksum);
      const repeated = await captureBcnNorm({
        metadata: { ...metadata, capturedAt: "2026-09-19T00:00:00.000Z" },
        outputDir,
        endpoint: "https://example.test/norma",
        fetchImpl: async () => new Response(responseBody, { status: 200 }),
      });
      expect(repeated.rawPath).toBe(result.rawPath);
      expect(repeated.snapshot.source.capturedAt).toBe(metadata.capturedAt);
      expect(repeated.snapshot.source.url).toContain("https://example.test/norma?idNorma=210676");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("reports HTTP and timeout failures explicitly", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "legisdata-bcn-"));
    try {
      await expect(captureBcnNorm({
        metadata,
        outputDir,
        fetchImpl: async () => new Response("unavailable", { status: 503 }),
      })).rejects.toThrow("HTTP 503");
      await expect(captureBcnNorm({
        metadata,
        outputDir,
        timeoutMs: 1,
        fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
      })).rejects.toThrow("timed out");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
