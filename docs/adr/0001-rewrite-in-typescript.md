# 从 Python 重写为 TypeScript

原项目基于 Python（requests + pyyaml），重写为 TypeScript 并发布为 npm 包。核心动机是 `npx dify-dsl-pipe` 零安装一键执行——Python 生态没有等效的分发体验（pipx 需要用户预装，认知度远低于 npx）。此外 TypeScript 的类型系统更适合 CLI 工具的长期维护，Node.js 生态的交互式 CLI 库（inquirer、clack）也显著优于 Python 选项。

## Considered Options

- **保持 Python，用 pipx 分发**：无需重写，但 `pipx run` 的用户认知度和安装体验远不如 `npx`。
- **Go 编译为单二进制**：零依赖分发，但失去 npm 生态的 Skill/MCP 集成便利性，且云存储 SDK 生态不如 Node.js。

## Consequences

- 需要完全重写，但原项目代码量不大（~1200 行），成本可控。
- 云存储 SDK 需确认 Node.js 版本可用——阿里云 OSS（ali-oss）、腾讯 COS（cos-nodejs-sdk-v5）、火山云（@volcengine/tos-sdk）均有官方 Node SDK。
