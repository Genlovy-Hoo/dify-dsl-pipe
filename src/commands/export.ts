import type { Command } from "commander";
import { DifyClient } from "../core/client.js";
import { exportApps } from "../core/exporter.js";
import { loadConfig, resolveInstanceConfig } from "../config/loader.js";
import { createStorage } from "../storage/factory.js";
import type { ExportOptions } from "../config/types.js";
import { log, formatDuration, setJsonMode, setLogLevel } from "../utils/logger.js";
import pc from "picocolors";

export function registerExportCommand(program: Command) {
  program
    .command("export")
    .description("导出 Dify 应用 DSL")
    .option("--url <url>", "Dify Console API 地址")
    .option("--token <token>", "Access Token")
    .option("--email <email>", "登录邮箱")
    .option("--password <password>", "登录密码")
    .option("--profile <name>", "使用配置文件中的 profile")
    .option("-c, --config <path>", "配置文件路径")
    .option("-o, --out <path>", "输出目录（本地存储时）", "./dify-backup")
    .option("--storage <type>", "存储类型: local, s3, git", "local")
    .option("--s3-bucket <bucket>", "S3 Bucket 名称")
    .option("--s3-endpoint <endpoint>", "S3 端点（兼容阿里云/腾讯云/MinIO 等）")
    .option("--s3-region <region>", "S3 区域", "us-east-1")
    .option("--s3-access-key <key>", "S3 Access Key ID")
    .option("--s3-secret-key <key>", "S3 Secret Access Key")
    .option("--git-repo <path>", "Git 仓库路径或 URL")
    .option("--git-branch <branch>", "Git 分支", "main")
    .option("--pattern <pattern>", "文件命名模板", "by-type")
    .option("--filter <expr>", "过滤表达式 (如 type:workflow,tag:核心,name:xxx)")
    .option("--include-secret", "包含敏感信息")
    .option("--no-include-secret", "不包含敏感信息（默认）")
    .option("--include-versions", "包含版本历史（默认）")
    .option("--no-include-versions", "不包含版本历史")
    .option("--incremental", "增量导出（只导出有更新的应用）")
    .option("--archive <format>", "打包格式: none, zip", "none")
    .option("--workspace <id>", "指定 Workspace ID")
    .option("--json", "JSON 格式输出")
    .option("--verbose", "详细日志")
    .action(async (opts) => {
      if (opts.json) setJsonMode(true);
      if (opts.verbose) setLogLevel("debug");

      try {
        const config = loadConfig(opts.config);
        const resolved = resolveInstanceConfig(config, opts);

        // 构建存储配置
        const storageConfig = resolved.storage ?? buildStorageFromFlags(opts);

        // 连接 Dify
        const client = new DifyClient({
          baseUrl: resolved.instance.url,
          email: resolved.instance.email,
          password: resolved.instance.password,
          token: resolved.instance.token,
          timeout: resolved.instance.timeout,
          maxRetries: resolved.instance.maxRetries,
        });

        const info = await client.connect();
        log.success(`已连接 Dify ${info.version} (${info.adapterType} adapter)`);

        // 切换 Workspace
        if (opts.workspace ?? resolved.workspace) {
          await client.switchWorkspace(opts.workspace ?? resolved.workspace!);
          log.info(`已切换到 Workspace: ${opts.workspace ?? resolved.workspace}`);
        }

        // 创建存储
        const storage = createStorage(storageConfig);
        if (!(await storage.testConnection())) {
          log.error("存储后端连接失败");
          process.exit(1);
        }

        // 解析过滤条件
        const filter = parseFilter(opts.filter);

        // 执行导出
        const result = await exportApps(client, storage, {
          includeSecret: opts.includeSecret ?? false,
          includeVersionHistory: opts.includeVersions ?? true,
          incremental: opts.incremental,
          archive: opts.archive,
          pattern: opts.pattern,
          filter,
          instanceName: resolved.instance.name,
          workspaceName: opts.workspace ?? resolved.workspace,
        });

        // 输出结果
        if (opts.json) {
          console.log(JSON.stringify({
            success: true,
            exported: result.success.length,
            failed: result.failed.length,
            total: result.totalApps,
            duration: result.duration,
            files: result.success.map((e) => e.filePath),
          }));
        } else {
          console.error("");
          log.success(
            `导出完成：${pc.bold(String(result.success.length))} 个应用，` +
            `耗时 ${formatDuration(result.duration)}`
          );
          if (result.failed.length) {
            log.warn(`${result.failed.length} 个应用导出失败`);
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

function buildStorageFromFlags(opts: Record<string, unknown>) {
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
      commitMessage: "chore: dify dsl backup {date}",
      authorName: "dify-dsl-pipe",
      authorEmail: "dify-dsl-pipe@noreply",
      push: true,
    };
  }

  return {
    type: "local" as const,
    path: (opts.out as string) ?? "./dify-backup",
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
