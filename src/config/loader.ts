import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import { ConfigSchema, type Config } from "./types.js";

const CONFIG_FILENAMES = ["dify-pipe.yaml", "dify-pipe.yml", "config.yaml", "config.yml"];

const CONFIG_DIRS = [
  process.cwd(),
  resolve(homedir(), ".dify-pipe"),
  ...(process.platform === "win32"
    ? [resolve(process.env.APPDATA ?? homedir(), "dify-pipe")]
    : ["/etc/dify-pipe"]),
];

export function findConfigFile(explicitPath?: string): string | null {
  if (explicitPath) {
    const p = resolve(explicitPath);
    return existsSync(p) ? p : null;
  }
  for (const dir of CONFIG_DIRS) {
    for (const name of CONFIG_FILENAMES) {
      const p = resolve(dir, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export function loadConfig(explicitPath?: string): Config {
  const configPath = findConfigFile(explicitPath);

  let raw: Record<string, unknown> = {};
  if (configPath) {
    const content = readFileSync(configPath, "utf-8");
    raw = parseYaml(content) ?? {};
  }

  applyEnvOverrides(raw);

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`配置验证失败:\n${issues}`);
  }
  return result.data;
}

function applyEnvOverrides(config: Record<string, unknown>): void {
  const env = process.env;
  if (env.DIFY_URL || env.DIFY_TOKEN) {
    const instances = (config.instances as unknown[]) ?? [];
    const envInstance = {
      name: "env",
      url: env.DIFY_URL ?? "",
      token: env.DIFY_TOKEN,
      email: env.DIFY_EMAIL,
      password: env.DIFY_PASSWORD,
    };
    instances.unshift(envInstance);
    config.instances = instances;
  }

  if (env.DIFY_S3_BUCKET) {
    config.defaults = {
      ...(config.defaults as Record<string, unknown>),
      storage: {
        type: "s3",
        bucket: env.DIFY_S3_BUCKET,
        region: env.DIFY_S3_REGION ?? "us-east-1",
        endpoint: env.DIFY_S3_ENDPOINT,
        accessKeyId: env.DIFY_S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.DIFY_S3_SECRET_ACCESS_KEY ?? "",
      },
    };
  }
}

export function resolveInstanceConfig(
  config: Config,
  opts: { url?: string; token?: string; email?: string; password?: string; profile?: string }
) {
  if (opts.url) {
    return {
      instance: {
        name: "cli",
        url: opts.url,
        token: opts.token,
        email: opts.email,
        password: opts.password,
        timeout: 30,
        maxRetries: 3,
      },
      workspace: undefined as string | undefined,
      storage: config.defaults?.storage,
      exportOpts: config.defaults?.export,
      importOpts: config.defaults?.import,
    };
  }

  if (opts.profile) {
    const profile = config.profiles[opts.profile];
    if (!profile) throw new Error(`Profile "${opts.profile}" 未找到`);

    const instance = config.instances.find((i) => i.name === profile.instance);
    if (!instance) throw new Error(`Instance "${profile.instance}" 未找到`);

    return {
      instance,
      workspace: profile.workspace,
      storage: profile.storage,
      exportOpts: profile.export ?? config.defaults?.export,
      importOpts: profile.import ?? config.defaults?.import,
    };
  }

  if (config.instances.length > 0) {
    const instance = config.instances[0];
    return {
      instance,
      workspace: undefined as string | undefined,
      storage: config.defaults?.storage,
      exportOpts: config.defaults?.export,
      importOpts: config.defaults?.import,
    };
  }

  throw new Error("未找到 Dify 实例配置。使用 --url 指定地址，或创建配置文件。");
}
