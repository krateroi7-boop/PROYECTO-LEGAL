import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import type { RawStorage, StoredObject } from "./types";

export class FilesystemRawStorage implements RawStorage {
  constructor(private readonly root = process.env.LEGISDATA_STORAGE_ROOT ?? ".storage") {}

  async put(key: string, content: string): Promise<StoredObject> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    // Link a complete temporary object atomically, so concurrent readers never see a partial write.
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    try {
      await link(temporaryPath, path).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
        if (await readFile(path, "utf8") !== content) throw new Error(`Immutable storage object has different content: ${key}`);
      });
    } finally {
      await unlink(temporaryPath);
    }
    return this.describe(key, content);
  }

  async get(key: string): Promise<StoredObject> {
    const content = await readFile(this.pathFor(key), "utf8");
    return this.describe(key, content);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private pathFor(key: string) {
    if (!key || isAbsolute(key) || key.includes("\\") || key.includes("\0") || key.split("/").some((part) => part === ".." || part === "." || !part)) {
      throw new Error("Storage key must be a relative path without traversal segments.");
    }
    const root = resolve(this.root);
    const path = resolve(root, key);
    if (!path.startsWith(`${root}${sep}`)) throw new Error("Storage key escapes the storage root.");
    return path;
  }

  private describe(key: string, content: string): StoredObject {
    return {
      key,
      content,
      checksum: createHash("sha256").update(content).digest("hex"),
      size: Buffer.byteLength(content, "utf8"),
    };
  }
}
