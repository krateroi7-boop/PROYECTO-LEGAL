import { describe, expect, it } from "vitest";
import { buildReaderTree, readerUrl } from "@/lib/reader/structure";
import { findTextMatches, searchBlocks } from "@/lib/reader/search";
import type { ReaderIndexNode } from "@/lib/reader/types";

const node = (stableKey: string, parentStableKey: string | null = null, position = 0): ReaderIndexNode => ({ stableKey, parentStableKey, position, type: "articulo", label: stableKey, title: null });

describe("Legal reader structure", () => {
  it("preserves hierarchy and all orphans and breaks cycles without losing nodes", () => {
    const tree = buildReaderTree([node("a", "b", 1), node("b", "a", 2), node("c", "absent", 3), node("d", "d", 4), node("e", "a", 5)]);
    const flatten = (items: typeof tree): string[] => items.flatMap((item) => [item.stableKey, ...flatten(item.children)]);
    expect(flatten(tree).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(tree.find((item) => item.stableKey === "b")?.children[0].children[0].stableKey).toBe("e");
  });
  it("keeps existing routes and pins version and anchor", () => {
    expect(readerUrl("ley-19880", "version-1", "articulo-1")).toBe("/normas/ley-19880/versiones/version-1#articulo-1");
    expect(readerUrl("ley-19880")).toBe("/normas/ley-19880");
  });
});

describe("In-document search", () => {
  it("matches accents and case while returning exact original UTF-16 offsets", () => {
    const text = "😀 ACCIÓN y accio\u0301n pública";
    const found = findTextMatches(text, "accion");
    expect(found.map((hit) => text.slice(hit.start, hit.end))).toEqual(["ACCIÓN", "accio\u0301n"]);
    expect(findTextMatches("pública", "PUBLICA")).toEqual([{ start: 0, end: 7 }]);
    expect(findTextMatches(text, "  ")).toEqual([]);
    expect(findTextMatches("a+b [ley]", "[ley]")).toHaveLength(1);
  });
  it("matches across processing windows once and supports cancellation", async () => {
    const text = "x".repeat(4094) + "acción pública";
    const result = await searchBlocks([{ value: "articulo-1", text }], "accion publica", new AbortController().signal);
    expect(result[0].matches).toEqual([{ start: 4094, end: text.length }]);
    const repeated = "x" + "a".repeat(8200);
    const across = await searchBlocks([{ value: 1, text: repeated }], "aa", new AbortController().signal);
    expect(across[0].matches).toEqual(findTextMatches(repeated, "aa"));
    const controller = new AbortController(); controller.abort();
    await expect(searchBlocks([{ value: 1, text }], "ley", controller.signal)).rejects.toThrow("Cancelled");
  });
  it("searches a synthetic two-million-character document cooperatively", async () => {
    const text = "La acción administrativa y la información pública. ".repeat(4);
    const blocks = Array.from({ length: 10000 }, (_, value) => ({ value, text }));
    const slices: number[] = [];
    const result = await searchBlocks(blocks, "informacion", new AbortController().signal, (ms) => slices.push(ms));
    expect(result).toHaveLength(10000);
    expect(result[0].matches).toHaveLength(4);
    // Scheduling latency varies in CI; use real browser measurements for the 50 ms target.
    expect(slices.length).toBeGreaterThan(1);
  });
});
