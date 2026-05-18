import type { Command } from "commander";
import { serve } from "@hono/node-server";
import { DifyClient } from "../core/client.js";
import { loadConfig, resolveInstanceConfig } from "../config/loader.js";
import { createStorage } from "../storage/factory.js";
import { createApi, setWebhookUrl, stopAllJobs, type ServeContext } from "../serve/api.js";
import { startMcpServer } from "../serve/mcp.js";
import { log, setJsonMode, setLogLevel } from "../utils/logger.js";
import pc from "picocolors";

export function registerServeCommand(program: Command) {
  program
    .command("serve")
    .description("启动 HTTP API 服务 / MCP Server")
    .option("--mcp", "以 MCP Server 模式启动 (stdio)")
    .option("--port <port>", "HTTP 端口", "3000")
    .option("--host <host>", "绑定地址", "127.0.0.1")
    .option("--url <url>", "Dify Console API 地址")
    .option("--token <token>", "Access Token")
    .option("--email <email>", "登录邮箱")
    .option("--password <password>", "登录密码")
    .option("--profile <name>", "使用配置文件中的 profile")
    .option("-c, --config <path>", "配置文件路径")
    .option("-o, --out <path>", "输出目录（本地存储时）", "./dify-backup")
    .option("--storage <type>", "存储类型: local, s3, git", "local")
    .option("--s3-bucket <bucket>", "S3 Bucket")
    .option("--s3-endpoint <endpoint>", "S3 端点")
    .option("--s3-region <region>", "S3 区域", "us-east-1")
    .option("--s3-access-key <key>", "S3 Access Key ID")
    .option("--s3-secret-key <key>", "S3 Secret Access Key")
    .option("--git-repo <path>", "Git 仓库路径或 URL")
    .option("--git-branch <branch>", "Git 分支", "main")
    .option("--pattern <pattern>", "文件命名模板", "by-type")
    .option("--webhook <url>", "Webhook 通知地址")
    .option("--json", "JSON 格式输出")
    .option("--verbose", "详细日志")
    .action(async (opts) => {
      if (opts.json) setJsonMode(true);
      if (opts.verbose) setLogLevel("debug");

      try {
        const config = loadConfig(opts.config);

        const clients = new Map<string, { client: DifyClient; name: string }>();

        if (opts.url) {
          const client = new DifyClient({
            baseUrl: opts.url,
            email: opts.email,
            password: opts.password,
            token: opts.token,
            timeout: 30,
            maxRetries: 3,
          });
          const info = await client.connect();
          const name = "cli";
          clients.set(name, { client, name });
          log.success(`已连接 ${name}: Dify ${info.version} (${info.adapterType})`);
        } else {
          for (const inst of config.instances) {
            try {
              const client = new DifyClient({
                baseUrl: inst.url,
                email: inst.email,
                password: inst.password,
                token: inst.token,
                timeout: inst.timeout ?? 30,
                maxRetries: inst.maxRetries ?? 3,
              });
              const info = await client.connect();
              clients.set(inst.name, { client, name: inst.name });
              log.success(`已连接 ${inst.name}: Dify ${info.version} (${info.adapterType})`);
            } catch (e) {
              log.warn(`跳过 ${inst.name}: ${e instanceof Error ? e.message : e}`);
            }
          }
        }

        if (clients.size === 0) {
          log.error("没有可用的 Dify 实例连接");
          process.exit(1);
        }

        const storageConfig = buildStorageFromFlags(opts);
        const storage = createStorage(storageConfig);
        if (!(await storage.testConnection())) {
          log.error("存储后端连接失败");
          process.exit(1);
        }

        const ctx: ServeContext = {
          clients,
          storage,
          exportOpts: {
            includeSecret: false,
            includeVersionHistory: true,
            incremental: false,
            archive: "none",
            pattern: opts.pattern,
          },
        };

        if (opts.webhook) {
          setWebhookUrl(opts.webhook);
        }

        if (opts.mcp) {
          // MCP 模式不输出到 stdout
          setLogLevel("silent");
          await startMcpServer({
            clients,
            storage,
            exportOpts: ctx.exportOpts,
          });
          return;
        }

        // HTTP API 模式
        const api = createApi(ctx);
        const port = parseInt(opts.port, 10);
        const host = opts.host;

        const shutdown = () => {
          log.info("正在关闭...");
          stopAllJobs();
          process.exit(0);
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
        if (process.platform === "win32") {
          process.on("SIGHUP", shutdown);
        }

        serve({ fetch: api.fetch, port, hostname: host }, () => {
          log.success(`HTTP API 已启动: ${pc.bold(`http://${host}:${port}`)}`);
          log.info(`已连接 ${clients.size} 个 Dify 实例`);
          log.info(`端点: POST /export, POST /import, GET /status, GET /jobs, POST /jobs`);
        });
      } catch (e) {
        log.error(e instanceof Error ? e.message : String(e));
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
