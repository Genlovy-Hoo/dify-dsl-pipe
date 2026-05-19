# MCP Server 集成

← [返回 README](../README.md)

`dify-dsl-pipe` 可作为标准 MCP Server 运行，通过 stdio transport 向 AI 工具暴露操作 Dify 的能力。Claude Code、Cursor、OpenCode 等任何兼容 MCP 协议的客户端均可接入。

---

## 暴露的工具

| 工具名 | 说明 |
|--------|------|
| `list_instances` | 列出已连接的 Dify 实例及版本信息 |
| `list_apps` | 列出指定实例的所有应用（含类型、标签） |
| `export_apps` | 导出应用 DSL（支持过滤、增量导出） |
| `import_apps` | 导入 DSL 到指定实例（支持冲突策略、预览模式） |

---

## 启动 MCP Server

```bash
# 单实例
npx dify-dsl-pipe serve --mcp \
  --url https://your-dify.com/console/api --token YOUR_TOKEN

# 多实例（推荐）
npx dify-dsl-pipe serve --mcp --config /path/to/dify-pipe.yaml
```

MCP 模式下进程接管 stdin/stdout 与客户端通信，**持续运行不退出，属正常行为**。日志写到 stderr，不干扰 MCP 协议。

---

## 客户端配置示例

各 AI 工具的配置字段名可能略有不同，以下为常见格式，请以各工具官方文档为准。

### Claude Code / claude_desktop_config.json

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

单实例写法：

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

### Cursor / .cursor/mcp.json

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

### OpenCode / opencode.json

```json
{
  "mcp": {
    "servers": {
      "dify-dsl-pipe": {
        "command": "npx",
        "args": ["-y", "dify-dsl-pipe", "serve", "--mcp",
                 "--config", "/path/to/dify-pipe.yaml"]
      }
    }
  }
}
```

---

## 注意事项

- 配置文件路径建议用**绝对路径**，避免不同工具的工作目录不一致导致找不到文件
- 修改 `dify-pipe.yaml` 后需重启 MCP Server 进程才能生效
- 多实例场景强烈建议用 `--config` 而非逐一传 `--url --token`
- MCP Server 与 Skill 是两个独立入口：Skill 面向 agent 自然语言交互，MCP 面向工具调用协议
