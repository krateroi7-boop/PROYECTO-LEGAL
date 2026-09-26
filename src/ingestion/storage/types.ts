export type StoredObject = {
  key: string;
  content: string;
  checksum: string;
  size: number;
};

export interface RawStorage {
  put(key: string, content: string): Promise<StoredObject>;
  get(key: string): Promise<StoredObject>;
  exists(key: string): Promise<boolean>;
}
