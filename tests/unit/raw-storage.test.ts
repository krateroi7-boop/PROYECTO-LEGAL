import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilesystemRawStorage, sourceObjectKey } from "@/ingestion/storage";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function storage() {
  const root = await mkdtemp(join(tmpdir(), "legisdata-storage-"));
  directories.push(root);
  return { root, store: new FilesystemRawStorage(root) };
}

describe("immutable raw evidence storage", () => {
  it("deduplicates concurrent identical writes and prevents replacement", async () => {
    const { root, store } = await storage();
    const content = "Artículo único: a > b.\n";
    const checksum = createHash("sha256").update(content).digest("hex");
    const key = sourceObjectKey("bcn-leychile", "123", checksum, "json");
    const writes = await Promise.all(Array.from({ length: 5 }, () => store.put(key, content)));
    expect(writes.every((object) => object.checksum === checksum)).toBe(true);
    await expect(store.put(key, "replacement")).rejects.toThrow("different content");
    expect((await store.get(key)).content).toBe(content);
    expect((await readdir(root, { recursive: true })).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it.each(["../outside", "/absolute", "nested/../../outside", "nested\\outside", "nested//file"])("rejects unsafe key %s for reading and writing", async (key) => {
    const { store } = await storage();
    await expect(store.put(key, "content")).rejects.toThrow("Storage key");
    await expect(store.get(key)).rejects.toThrow("Storage key");
    await expect(store.exists(key)).rejects.toThrow("Storage key");
  });

  it("rejects non-content-addressed identities before creating a path", () => {
    expect(() => sourceObjectKey("bcn-leychile", "../../bad", "a".repeat(64), "json")).toThrow("identity");
    expect(() => sourceObjectKey("bcn-leychile", "123", "not-a-hash", "json")).toThrow("identity");
  });
});
