import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RawStorage, StoredObject } from "./types";

export class FilesystemRawStorage implements RawStorage {
  constructor(private readonly root = process.env.LEGISDATA_STORAGE_ROOT ?? ".staging") {}

  async put(key: string, content: string): Promise<StoredObject> {
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { encoding: "utf8", flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") throw new Error(`Storage object already exists: ${key}`);
      throw error;
    });
    return this.describe(key, content);
  }

  async get(key: string): Promise<StoredObject> {
    const content = await readFile(join(this.root, key), "utf8");
    return this.describe(key, content);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(join(this.root, key));
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
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
