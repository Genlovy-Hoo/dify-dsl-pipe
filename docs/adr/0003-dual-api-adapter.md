# 双 Adapter 适配 Dify 版本

工具通过 API 响应头 `X-Version` 自动检测 Dify 版本，选择对应的 API adapter：Legacy（0.6.0~0.15.3）或 Modern（1.0.0+）。不支持 0.6.0 以下版本（DSL 概念尚不存在）。

两个版本段的关键差异：认证机制（Bearer token vs HttpOnly Cookie + CSRF）、导入端点路径（`/apps/{id}/workflows/draft/import` vs `/apps/imports`）、DSL 格式（是否含 `dependencies` 字段）。

## Considered Options

- **只支持最新稳定版**：实现最简单，但社区中仍有大量 0.x 用户（尤其是 0.15.3 作为 1.0 前最后的稳定版），完全不管会丢失用户。
- **全版本兼容**：维护成本过高，0.3~0.5 时代 API 变化大且用户极少。
