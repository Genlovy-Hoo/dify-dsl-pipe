# 用 S3 协议统一云存储后端

v1 不为每个云厂商写独立 adapter，而是用一个 S3 协议 adapter 通吃 AWS S3、阿里云 OSS（S3 兼容模式）、腾讯 COS（S3 兼容模式）、MinIO、Cloudflare R2 等。用户只需提供 `--s3-endpoint` 指向不同厂商的 S3 兼容端点。这将存储后端从 9 个减少到 3 个（local、S3、git），大幅降低 v1 的实现和维护成本。

## Considered Options

- **每个云厂商独立 adapter（原方案）**：使用各厂商原生 SDK，功能最完整，但 v1 需要实现和测试 9 个 adapter。
- **只做 local + S3**：更精简，但 git 作为版本管理型存储在备份场景有独特价值，砍掉可惜。

## Consequences

- 依赖各云厂商的 S3 兼容性。主流厂商（阿里云、腾讯云、MinIO）的 S3 兼容模式已相当成熟，但火山云 TOS 的 S3 兼容可能需要验证。
- 如果某厂商的 S3 兼容有边缘问题，后续可以加独立 adapter 作为 fallback。
