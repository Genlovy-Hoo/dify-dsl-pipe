import type { Command } from "commander";
import { DifyClient } from "../core/client.js";
import { importApps } from "../core/importer.js";
import { loadConfig, resolveInstanceConfig } from "../config/loader.js";
import { createStorage } from "../storage/factory.js";
import { log, formatDuration, setJsonMode, setLogLevel } from "../utils/logger.js";
import pc from "picocolors";

export function registerImportCommand(program: Command) {
  program
    .command("import")
    .description("导入 DSL 到 Dify 实例")
    .option("--url <url>", "目标 Dify Console API 地址")
    .option("--token <token>", "Access Token")
    .option("--token-admin <token>", "Admin API Key（与 --workspace 一起使用时会附加 X-WORKSPACE-ID）")
    .option("--email <email>", "登录邮箱")
    .option("--password <password>", "登录密码")
    .option("--profile <name>", "使用配置文件中的 profile")
    .option("-c, --config <path>", "配置文件路径")
    .option("-s, --source <path>", "DSL 源目录或前缀", "./dify-backup")
    .option("--storage <type>", "源存储类型: local, s3, git", "local")
    .option("--s3-bucket <bucket>", "S3 Bucket")
    .option("--s3-endpoint <endpoint>", "S3 端点")
    .option("--s3-region <region>", "S3 区域", "us-east-1")
    .option("--s3-access-key <key>", "S3 Access Key ID")
    .option("--s3-secret-key <key>", "S3 Secret Access Key")
    .option("--git-repo <path>", "Git 仓库路径或 URL")
    .option("--git-branch <branch>", "Git 分支", "main")
    .option("--filter <expr>", "过滤表达式 (如 type:advanced-chat,name:hello,tag:核心)")
    .option("--on-conflict <strategy>", "冲突策略: skip, overwrite", "skip")
    .option("--dry-run", "预览模式（不实际导入）")
    .option("--workspace <id>", "指定 Workspace ID")
    .option("--json", "JSON 格式输出")
    .option("--verbose", "详细日志")
    .action(async (opts) => {
      if (opts.json) setJsonMode(true);
      if (opts.verbose) setLogLevel("debug");

      try {
        const config = loadConfig(opts.config);
        const resolved = resolveInstanceConfig(config, opts);
        const resolvedWorkspace = opts.workspace ?? resolved.workspace;
        const effectiveToken = opts.tokenAdmin ?? resolved.instance.token;
        const workspaceIdHeader = opts.tokenAdmin && resolvedWorkspace ? resolvedWorkspace : undefined;

        // 连接目标 Dify
        const client = new DifyClient({
          baseUrl: resolved.instance.url,
          email: resolved.instance.email,
          password: resolved.instance.password,
          token: effectiveToken,
          workspaceIdHeader,
          timeout: resolved.instance.timeout,
          maxRetries: resolved.instance.maxRetries,
        });

        const info = await client.connect();
        log.success(`已连接目标 Dify ${info.version} (${info.adapterType} adapter)`);

        if (resolvedWorkspace) {
          await client.switchWorkspace(resolvedWorkspace);
          log.info(`已切换到 Workspace: ${resolvedWorkspace}`);
        }

        // 创建源存储
        const storageConfig = buildSourceStorage(opts);
        const storage = createStorage(storageConfig);
        if (!(await storage.testConnection())) {
          log.error("源存储连接失败");
          process.exit(1);
        }

        // 执行导入
        // local 存储时 source 已作为 basePath，避免再次作为 prefix 导致路径重复拼接
        const importSource =
          opts.storage === "local"
            ? undefined
            : opts.source !== "./dify-backup"
              ? opts.source
              : undefined;

        const result = await importApps(client, storage, {
          dryRun: opts.dryRun,
          onConflict: opts.onConflict,
          filter: parseFilter(opts.filter),
          source: importSource,
        });

        // 导入完全成功后清理存储临时资源（如 git clone 目录）；失败时保留现场便于排查
        if (result.failed.length === 0 && storage.finalize) {
          await storage.finalize();
        }

        // 输出结果
        if (opts.json) {
          console.log(JSON.stringify({
            success: true,
            dryRun: opts.dryRun,
            created: result.created.length,
            skipped: result.skipped.length,
            overwritten: result.overwritten.length,
            failed: result.failed.length,
            duration: result.duration,
            details: {
              created: result.created,
              skipped: result.skipped,
              overwritten: result.overwritten,
              failed: result.failed,
            },
          }));
        } else {
          console.error("");
          const prefix = opts.dryRun ? pc.yellow("[预览] ") : "";
          log.success(
            `${prefix}导入完成：` +
            `${pc.green(String(result.created.length))} 创建, ` +
            `${pc.yellow(String(result.skipped.length))} 跳过, ` +
            `${pc.blue(String(result.overwritten.length))} 覆盖, ` +
            `${pc.red(String(result.failed.length))} 失败 — ` +
            `耗时 ${formatDuration(result.duration)}`
          );

          if (opts.dryRun && result.created.length + result.overwritten.length > 0) {
            console.error(pc.dim("  去掉 --dry-run 执行实际导入"));
          }
        }

        process.exit(result.failed.length > 0 ? 1 : 0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error(msg);
        process.exit(1);
      }
    });
}

function buildSourceStorage(opts: Record<string, unknown>) {
  const type = (opts.storage as string) ?? "local";

  if (type === "s3") {
    return {
      type: "s3" as const,
      bucket: (opts.s3Bucket as string) ?? "",
      endpoint: opts.s3Endpoint as string | undefined,
      region: (opts.s3Region as string) ?? "us-east-1",
      accessKeyId: (opts.s3AccessKey as string) ?? process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: (opts.s3SecretKey as string) ?? process.env.AWS_SECRET_ACCESS_KEY ?? "",
      prefix: "",
      forcePathStyle: false,
    };
  }

  if (type === "git") {
    return {
      type: "git" as const,
      repo: (opts.gitRepo as string) ?? ".",
      branch: (opts.gitBranch as string) ?? "main",
      path: ".",
      commitMessage: "",
      authorName: "",
      authorEmail: "",
      push: false,
    };
  }

  return {
    type: "local" as const,
    path: (opts.source as string) ?? "./dify-backup",
  };
}

function parseFilter(expr?: string) {
  if (!expr) return undefined;

  const filter: { names?: string[]; tags?: string[]; types?: string[] } = {};

  for (const part of expr.split(",")) {
    const [key, ...valueParts] = part.split(":");
    const value = valueParts.join(":");
    if (!value) continue;

    switch (key.trim().toLowerCase()) {
      case "type":
        (filter.types ??= []).push(value.trim());
        break;
      case "tag":
        (filter.tags ??= []).push(value.trim());
        break;
      case "name":
        (filter.names ??= []).push(value.trim());
        break;
    }
  }

  return Object.keys(filter).length ? filter : undefined;
}
