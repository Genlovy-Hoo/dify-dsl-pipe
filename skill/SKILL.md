---
name: dify-dsl-pipe
description: |
  用于操作 dify-dsl-pipe CLI 工具的专业知识库，覆盖 Dify 应用的导出、导入、
  备份、迁移、定时备份服务和 MCP Server 集成的完整工作流。

  包含 Claude 通用知识所不具备的内容：dify-dsl-pipe 精确 CLI 语法；
  Dify 0.6~1.x 版本差异和自动 Adapter 切换；S3/OSS/COS/MinIO 存储后端配置；
  serve 模式 HTTP API 端点和 cron 参数；多实例/多环境 profile 管理；
  常见认证失败、网络问题和跨版本迁移警告的处理方案。

  触发此 skill 的典型场景（即使用户不知道这个工具的存在）：
  - 备份或导出 Dify 应用（"帮我备份 Dify"、"导出 dify 工作流"、"dify backup"）
  - 跨实例迁移（"把生产应用同步到测试环境"、"copy dify apps to another server"）
  - 定时自动备份（"每天自动备份 dify"、"dify schedule backup"）
  - AI 工具直连 Dify（"cursor/codex/opencode 连接 dify"、"dify mcp server"）
  - 多实例/多环境管理（"管理多个 dify 实例"、"dify 生产测试环境同步"）

  不适用：仅询问 Dify 功能使用方法（无备份/迁移意图）、一般性文件操作。
allowed-tools: Bash(npx dify-dsl-pipe *) Bash(node *dify-dsl-pipe*) Read Write
user-invocable: true
argument-hint: "[export|import|serve|init] [options]"
---

# dify-dsl-pipe

Dify DSL 一站式管道工具。零安装（`npx` 直接使用），支持导出、导入、跨实例迁移、定时备份服务、以及标准 MCP Server 集成。

> **协议兼容说明**  
> 此 Skill 遵循开放 Skill 协议，可被任何兼容该协议的 agent 应用加载和调用，包括但不限于：Claude Code、openclaw、cursor、codex、opencode、gemini cli、antigravity 等。  
> `serve --mcp` 产出的是标准 MCP Server（stdio transport），可被任何兼容 MCP 协议的客户端集成。

---

## 工具能力概览

| 场景 | 命令 |
|------|------|
| 一次性导出备份 | `export` |
| 从备份还原 / 跨实例导入 | `import` |
| 多实例管理 + 跨环境迁移 | 配置文件 + `--profile` |
| 持久化备份服务（HTTP API + 定时任务） | `serve` |
| 暴露为 MCP Server 供 AI 工具集成 | `serve --mcp` |
| 初始化配置文件 | `init` |

---

## Core commands

### 导出

```bash
# 最简：地址 + token，导出所有应用到 ./dify-backup
npx dify-dsl-pipe export --url <CONSOLE_API_URL> --token <TOKEN>

# 指定输出目录
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --out ./my-backup

# 按类型/标签/名称过滤（可组合）
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --filter "type:workflow"
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --filter "tag:生产,type:advanced-chat"
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --filter "name:客服机器人"

# 增量导出（只导出上次之后有变更的应用）
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --incremental

# 不导出版本历史（加快导出速度）
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --no-include-versions

# 包含敏感信息（API Key 等）
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --include-secret

# 导出到 S3（阿里云 OSS / 腾讯 COS / MinIO / AWS 统一用这个）
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage s3 --s3-bucket my-bucket --s3-endpoint oss-cn-hangzhou.aliyuncs.com \
  --s3-access-key <AK> --s3-secret-key <SK>

# 导出到 Git 仓库（自动 commit）
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage git --git-repo /path/to/repo

# 使用配置文件 profile（多实例管理时推荐）
npx dify-dsl-pipe export --profile prod

# JSON 输出（供程序解析）
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --json
```

### 导入

```bash
# 从本地目录导入到目标 Dify
npx dify-dsl-pipe import --url <TARGET_URL> --token <TOKEN> --source ./dify-backup

# 预览模式（强烈建议先跑一次）
npx dify-dsl-pipe import --url <TARGET_URL> --token <TOKEN> --source ./backup --dry-run

# 覆盖已有同名应用
npx dify-dsl-pipe import --url <TARGET_URL> --token <TOKEN> --source ./backup --on-conflict overwrite

# 使用 profile（多实例时推荐）
npx dify-dsl-pipe import --profile staging --source ./dify-backup/prod
```

### 多实例配置

多个 Dify 实例（生产/测试/多租户）时，推荐使用配置文件统一管理，避免每次重复输入连接信息。

运行 `npx dify-dsl-pipe init` 交互式创建，或手动建立 `dify-pipe.yaml`：

```yaml
instances:
  - name: prod
    url: "https://dify.prod.com/console/api"
    token: "prod-token"
  - name: staging
    url: "https://dify-staging.com/console/api"
    token: "staging-token"

profiles:
  prod:
    instance: prod
    storage:
      type: local
      path: "./backup/prod"
    export:
      pattern: "by-type"
      includeVersionHistory: true

  staging:
    instance: staging
    storage:
      type: local
      path: "./backup/staging"
```

有了配置文件后：
```bash
npx dify-dsl-pipe export --profile prod          # 导出生产
npx dify-dsl-pipe export --profile staging       # 导出测试
npx dify-dsl-pipe import --profile staging --source ./backup/prod  # 生产 → 测试迁移
```

### 初始化配置文件

```bash
npx dify-dsl-pipe init
```

### 查看命名预设

```bash
npx dify-dsl-pipe presets
```

---

### serve — 持久化服务模式

#### HTTP API 模式

适合部署在服务器上做自动定时备份，并通过 Webhook 接收通知。

```bash
# 启动 HTTP API 服务（默认 127.0.0.1:3000）
npx dify-dsl-pipe serve --url <URL> --token <TOKEN>

# 自定义端口 / 对外暴露
npx dify-dsl-pipe serve --url <URL> --token <TOKEN> --port 8080 --host 0.0.0.0

# 带 Webhook 通知（兼容 Slack / 企业微信 / 钉钉 / Discord / 通用 HTTP POST）
npx dify-dsl-pipe serve --url <URL> --token <TOKEN> --webhook https://hooks.slack.com/...

# 使用配置文件（多实例时 serve 会同时连接所有 instances）
npx dify-dsl-pipe serve --config ./dify-pipe.yaml
```

服务启动后的 HTTP API：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/status` | 运行状态、已连实例列表、uptime |
| POST | `/export` | 立即触发一次导出（可指定 instance） |
| POST | `/import` | 立即触发一次导入 |
| GET | `/jobs` | 列出所有定时任务 |
| POST | `/jobs` | 创建定时任务 |
| DELETE | `/jobs/:id` | 删除定时任务 |

创建定时任务示例：

```bash
# 每天凌晨 2 点自动导出
curl -X POST http://localhost:3000/jobs \
  -H "content-type: application/json" \
  -d '{"cron": "0 2 * * *", "action": "export", "instance": "prod"}'
```

#### MCP Server 模式

将 `dify-dsl-pipe` 作为标准 MCP Server 运行，供任何兼容 MCP 协议的 AI 应用直接调用 Dify 操作。

```bash
# 启动 MCP Server（stdio transport）
npx dify-dsl-pipe serve --mcp --url <URL> --token <TOKEN>

# 或使用配置文件（推荐，支持多实例）
npx dify-dsl-pipe serve --mcp --profile prod
```

MCP Server 暴露的工具：
- `list_instances` — 查看已连接的 Dify 实例列表
- `list_apps` — 列出指定实例的所有应用
- `export_apps` — 导出应用（支持 filter、incremental 参数）
- `import_apps` — 导入应用（支持 onConflict、dryRun 参数）

**客户端配置示例**（以 JSON 格式为例，各应用配置字段名称可能略有不同）：

```json
{
  "mcpServers": {
    "dify-dsl-pipe": {
      "command": "npx",
      "args": ["-y", "dify-dsl-pipe", "serve", "--mcp",
               "--url", "https://your-dify.com/console/api",
               "--token", "YOUR_TOKEN"]
    }
  }
}
```

使用配置文件的版本（多实例场景更简洁）：

```json
{
  "mcpServers": {
    "dify-dsl-pipe": {
      "command": "npx",
      "args": ["-y", "dify-dsl-pipe", "serve", "--mcp",
               "--config", "/path/to/dify-pipe.yaml"]
    }
  }
}
```

---

## Interaction pattern

遇到 Dify 相关需求时，按以下逻辑推进：

### 场景 A：一次性导出或备份

1. **确认意图**：只是导出备份，还是要同时导入到另一个实例？
2. **收集连接信息**：Dify 地址和认证方式（token 或 email+password）。没有就问。
3. **确认范围**：全部应用？还是按类型/标签/名称过滤？
4. **确认目标**：本地目录（默认）、S3、还是 git？
5. **执行** `npx dify-dsl-pipe export` 命令。
6. **报告结果**：导出了多少应用，有无失败。

### 场景 B：多实例管理 / 跨环境迁移

用户涉及"生产/测试"、"多个 Dify 实例"、"把 A 的应用同步到 B"等场景时：

1. **建议使用配置文件**（若还没有）：运行 `init` 或直接帮用户生成 `dify-pipe.yaml`。
2. **收集各实例信息**：每个实例的地址和 token。
3. **确认迁移方向**：从哪个实例导出，导入到哪个实例。
4. **确认冲突策略**：同名应用如何处理（跳过/覆盖）？
5. **执行两步流程**：
   ```bash
   # 步骤 1：从源实例导出
   npx dify-dsl-pipe export --profile prod --out ./migration-tmp
   # 步骤 2：导入到目标实例（先 dry-run 预览）
   npx dify-dsl-pipe import --profile staging --source ./migration-tmp --dry-run
   # 确认无误后去掉 --dry-run 执行
   ```
6. **报告结果**：多少应用迁移成功，同名冲突如何处理的。

### 场景 C：部署定时自动备份服务

1. **确认部署环境**：本地长期运行 / 服务器部署？
2. **收集连接信息**：同上，建议先 `init` 创建配置文件。
3. **确认备份频率**（用 cron 表达式，常见参考）：
   - 每天凌晨 2 点：`0 2 * * *`
   - 每小时：`0 * * * *`
   - 每周一 3 点：`0 3 * * 1`
4. **确认通知方式**：Slack / 企业微信 / 钉钉 / 不需要。
5. **生成启动命令**并建议用 pm2 / systemd 管理进程：
   ```bash
   npx dify-dsl-pipe serve --config ./dify-pipe.yaml --port 3000
   ```
6. **创建 cron 任务**（服务启动后调用一次 API）：
   ```bash
   curl -X POST http://localhost:3000/jobs \
     -H "content-type: application/json" \
     -d '{"cron": "0 2 * * *", "action": "export", "instance": "prod"}'
   ```

### 场景 D：配置 AI 工具直连 Dify（MCP 集成）

1. **确认使用的 AI 工具**（Claude Code、cursor、opencode、gemini cli 等），了解该工具的 MCP Server 配置方式。
2. **收集 Dify 连接信息**：地址和 token，建议用配置文件。
3. **生成 MCP Server 配置**（JSON 格式，字段名因工具而异，以常见格式为例）：
   ```json
   {
     "mcpServers": {
       "dify-dsl-pipe": {
         "command": "npx",
         "args": ["-y", "dify-dsl-pipe", "serve", "--mcp",
                  "--config", "/path/to/dify-pipe.yaml"]
       }
     }
   }
   ```
4. **告知注意事项**：
   - MCP Server 进程会持续运行，关闭终端会断开
   - 修改配置文件后需重启该进程
   - 多实例时建议用 `--config` 而非 `--url --token`

---

## Key parameters

| 参数 | 含义 |
|------|------|
| `--url` | Dify Console API 地址（必须以 `/console/api` 结尾） |
| `--token` | 浏览器 DevTools 获取的 access token |
| `--profile` | 使用配置文件中的命名 profile（多实例管理首选） |
| `--filter` | 过滤：`type:workflow`、`tag:标签名`、`name:关键词`（逗号组合） |
| `--pattern` | 命名预设：`flat`、`by-type`（默认）、`by-tag`、`by-workspace`、`full`，或自定义模板 |
| `--storage` | 存储后端：`local`（默认）、`s3`、`git` |
| `--incremental` | 只导出上次之后有变更的应用 |
| `--include-secret` | 导出包含敏感信息（API Key 等） |
| `--no-include-versions` | 不导出版本历史（默认开启，加此参数可加速） |
| `--on-conflict` | 导入冲突策略：`skip`（默认）或 `overwrite` |
| `--dry-run` | 预览导入计划，不实际执行 |
| `--json` | 输出 JSON，供程序解析 |
| `--workspace` | 指定 Workspace ID |
| `--mcp` | （serve 模式）以 MCP Server (stdio) 启动 |
| `--port` | （serve 模式）HTTP 端口，默认 3000 |
| `--host` | （serve 模式）监听地址，默认 127.0.0.1 |
| `--webhook` | （serve 模式）任务完成时的 Webhook 推送地址 |

---

## Gotchas

- `--url` 必须指向 **Console API**，不是普通 API。通常以 `/console/api` 结尾，`/apps` 结尾的是错的。
- Access token 会过期。认证报错时，让用户从浏览器 DevTools 刷新 token。
- S3 兼容存储（阿里云 OSS、腾讯 COS、MinIO）统一用 `--storage s3` + `--s3-endpoint`，没有独立的存储类型。
- `--filter` 语法用冒号不用等号：`type:workflow` 而非 `type=workflow`。
- 导入前**强烈建议先 `--dry-run`** 预览，确认后再执行。
- 版本历史导出只对 `workflow` 和 `advanced-chat` 类型有效，其他类型没有版本历史 API。
- **serve 模式**默认只监听 `127.0.0.1`（本地安全），对外暴露必须加 `--host 0.0.0.0`，且自行负责访问控制（当前无内置认证）。
- **MCP Server 模式**下进程接管 stdin/stdout 与客户端通信，进程会持续运行不退出，这是正常行为。日志自动写到 stderr，不会干扰 MCP 协议。
- **MCP 配置文件路径**因 AI 工具而异，不同工具的字段名也可能不同（有的叫 `mcpServers`，有的叫 `mcp_servers`），使用前查阅该工具的文档。
- 跨版本迁移（如 Dify 0.x → 1.x）工具自动检测版本并切换 Adapter，DSL 格式差异可能引起导入警告，属正常现象。
- 多实例迁移时，建议先在测试实例小范围验证，再全量迁移生产数据。
