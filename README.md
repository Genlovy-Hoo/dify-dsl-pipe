# dify-dsl-pipe

Dify 应用 DSL 一站式管道工具 — 导出、导入、备份、迁移、定时服务、MCP Server。

零安装，`npx` 直接使用。

## 快速上手

```bash
# 导出所有应用到 ./dify-backup
npx dify-dsl-pipe export --url https://your-dify.com/console/api --token YOUR_TOKEN

# 导入到目标实例
npx dify-dsl-pipe import --url https://target-dify.com/console/api --token TARGET_TOKEN --source ./dify-backup

# 交互式初始化配置文件
npx dify-dsl-pipe init
```

## 命令

| 命令 | 说明 |
|------|------|
| `export` | 批量导出应用 DSL |
| `import` | 批量导入应用 DSL |
| `serve` | 启动 HTTP API 服务（含定时任务） |
| `serve --mcp` | 启动 MCP Server（stdio，供 AI 工具集成） |
| `init` | 交互式创建配置文件 |
| `presets` | 列出可用的文件命名预设 |

## 存储后端

- **local** — 本地目录（默认）
- **s3** — S3 协议（AWS / 阿里云 OSS / 腾讯 COS / MinIO 等）
- **git** — Git 仓库（自动 commit）

```bash
# S3 示例（阿里云 OSS）
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage s3 --s3-bucket my-bucket \
  --s3-endpoint oss-cn-hangzhou.aliyuncs.com \
  --s3-access-key <AK> --s3-secret-key <SK>
```

## 过滤与命名

```bash
# 只导出 workflow 类型，打了"生产"标签的应用
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --filter "type:workflow,tag:生产"

# 自定义文件命名（预设：flat / by-type / by-tag / by-workspace / full）
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --pattern by-type
```

## 多实例 / 配置文件

```yaml
# dify-pipe.yaml
instances:
  - name: prod
    url: https://dify.prod.com/console/api
    token: prod-token
  - name: staging
    url: https://dify-staging.com/console/api
    token: staging-token

profiles:
  prod:
    instance: prod
    storage:
      type: local
      path: ./backup/prod
```

```bash
npx dify-dsl-pipe export --profile prod
npx dify-dsl-pipe import --profile staging --source ./backup/prod
```

## Serve 模式

```bash
# 启动 HTTP API（含定时任务管理）
npx dify-dsl-pipe serve --config dify-pipe.yaml --port 3000

# 创建每天凌晨 2 点自动导出任务
curl -X POST http://localhost:3000/jobs \
  -H "content-type: application/json" \
  -d '{"cron": "0 2 * * *", "action": "export"}'
```

## MCP Server

供 Claude Code、Cursor、OpenCode 等 AI 工具直接操作 Dify：

```bash
npx dify-dsl-pipe serve --mcp --config dify-pipe.yaml
```

```json
{
  "mcpServers": {
    "dify-dsl-pipe": {
      "command": "npx",
      "args": ["-y", "dify-dsl-pipe", "serve", "--mcp", "--config", "/path/to/dify-pipe.yaml"]
    }
  }
}
```

## Dify 版本支持

- **Modern**（1.0.0+）— Cookie + CSRF 认证
- **Legacy**（0.6.0 ~ 0.15.3）— Bearer Token 认证

自动检测版本，无需手动配置。

## License

MIT
