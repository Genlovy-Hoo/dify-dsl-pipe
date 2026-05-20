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
    .option("--all-workspaces", "导出所有 Workspace（自动遍历）")
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

        // 创建存储
        const storage = createStorage(storageConfig);
        if (!(await storage.testConnection())) {
          log.error("存储后端连接失败");
          process.exit(1);
        }

        const filter = parseFilter(opts.filter);
        const baseExportOpts = {
          includeSecret: opts.includeSecret ?? false,
          includeVersionHistory: opts.includeVersions ?? true,
          incremental: opts.incremental,
          archive: opts.archive,
          filter,
          instanceName: resolved.instance.name,
        };

        let totalSuccess = 0;
        let totalFailed = 0;
        let totalDuration = 0;
        let hasError = false;

        if (opts.allWorkspaces) {
          // --all-workspaces：遍历所有 workspace 逐一导出
          // 未显式指定 pattern 时从 by-type 升级为 by-workspace，目录自动按 workspace 分组
          const pattern = opts.pattern !== "by-type" ? opts.pattern : "by-workspace";
          const workspaces = await client.getWorkspaces();
          log.info(`找到 ${workspaces.length} 个 Workspace`);

          for (const ws of workspaces) {
            log.info(`\nWorkspace: ${pc.bold(ws.name)}`);
            try {
              await client.switchWorkspace(ws.id);
              const result = await exportApps(client, storage, {
                ...baseExportOpts,
                pattern,
                workspaceName: ws.name,
              });
              totalSuccess += result.success.length;
              totalFailed += result.failed.length;
              totalDuration += result.duration;
              if (result.failed.length) hasError = true;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              log.warn(`跳过 Workspace ${ws.name}: ${msg.slice(0, 100)}`);
              hasError = true;
            }
          }
        } else {
          // 单 workspace 导出（默认行为）
          if (opts.workspace ?? resolved.workspace) {
            await client.switchWorkspace(opts.workspace ?? resolved.workspace!);
            log.info(`已切换到 Workspace: ${opts.workspace ?? resolved.workspace}`);
          }
          const result = await exportApps(client, storage, {
            ...baseExportOpts,
            pattern: opts.pattern,
            workspaceName: opts.workspace ?? resolved.workspace,
          });
          totalSuccess = result.success.length;
          totalFailed = result.failed.length;
          totalDuration = result.duration;
          hasError = result.failed.length > 0;
        }

        // 输出结果
        if (opts.json) {
          console.log(JSON.stringify({
            success: !hasError,
            exported: totalSuccess,
            failed: totalFailed,
            duration: totalDuration,
          }));
        } else {
          console.error("");
          log.success(
            `导出完成：${pc.bold(String(totalSuccess))} 个应用，` +
            `耗时 ${formatDuration(totalDuration)}`
          );
          if (totalFailed) log.warn(`${totalFailed} 个应用导出失败`);
        }

        process.exit(hasError ? 1 : 0);
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
