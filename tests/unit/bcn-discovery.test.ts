import { describe, expect, it } from "vitest";
import { discoverBcnNorms } from "@/ingestion/sources/bcn-leychile/discovery";

describe("BCN discovery", () => {
  it("reports unsupported discovery instead of inventing a remote catalog", async () => {
    const result = await discoverBcnNorms(undefined);
    expect(result.supported).toBe(false);
    expect(result.entries).toEqual([]);
  });
});
