import type { StorageConfig } from "../config/types.js";
import type { StorageBackend } from "./interface.js";
import { LocalStorage } from "./local.js";
import { S3Storage } from "./s3.js";
import { GitStorage } from "./git.js";

export function createStorage(config: StorageConfig): StorageBackend {
  switch (config.type) {
    case "local":
      return new LocalStorage(config);
    case "s3":
      return new S3Storage(config);
    case "git":
      return new GitStorage(config);
    default:
      throw new Error(`不支持的存储类型: ${(config as { type: string }).type}`);
  }
}
