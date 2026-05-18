export interface StorageBackend {
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string>;
  list(prefix?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  testConnection(): Promise<boolean>;
  finalize?(): Promise<void>;
}
