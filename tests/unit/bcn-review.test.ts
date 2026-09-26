import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateBcnStagingDirectory } from "@/ingestion/sources/bcn-leychile/review";

describe("BCN staging review", () => {
  it("requires a matching source checksum and leaves publication pending", async () => {
    const directory = await mkdtemp(join(tmpdir(), "legisdata-review-"));
    try {
      const raw = JSON.stringify({ html: [] });
      const checksum = createHash("sha256").update(raw).digest("hex");
      await writeFile(join(directory, "source.json"), raw);
      await writeFile(join(directory, "snapshot.json"), JSON.stringify({
        source: {
          name: "BCN LeyChile",
          url: "https://example.com",
          capturedAt: "2026-01-01T00:00:00.000Z",
          checksum,
          parser: "bcn-leychile-json-v1",
        },
        norm: {},
        articles: [{ id: "articulo-1" }],
      }));
      const result = await validateBcnStagingDirectory(directory);
      expect(result.status).toBe("pending_legal_review");
      expect(result.sourceChecksumVerified).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
