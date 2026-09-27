/** A source identifier and original-byte hash identify immutable evidence independently of the parser. */
export function sourceObjectKey(sourceKey: string, identifier: string, checksum: string, extension: string) {
  if (![sourceKey, identifier].every((value) => /^[a-zA-Z0-9_-]+$/.test(value)) || !/^[a-f0-9]{64}$/.test(checksum) || !/^[a-z0-9]+$/.test(extension)) {
    throw new Error("Invalid immutable source object identity.");
  }
  return `sources/${sourceKey}/${identifier}/${checksum}.${extension}`;
}
