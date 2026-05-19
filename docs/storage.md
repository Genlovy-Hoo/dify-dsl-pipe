# 存储后端配置

← [返回 README](../README.md)

所有 S3 兼容存储统一使用 `--storage s3`，通过 `--s3-endpoint` 指向不同云厂商，无独立存储类型。

---

## local（本地目录）

默认存储，无需额外参数。

```bash
# 默认输出到 ./dify-backup
npx dify-dsl-pipe export --url <URL> --token <TOKEN>

# 指定目录
npx dify-dsl-pipe export --url <URL> --token <TOKEN> --out ./my-backup
```

---

## git（Git 仓库自动 commit）

导出后自动提交到 Git 仓库。

```bash
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage git --git-repo /path/to/backup-repo --git-branch main
```

配置文件方式：

```yaml
storage:
  type: git
  repo: "/path/to/backup-repo"
  branch: "main"
  push: true
```

---

## MinIO（自建 S3）

**必须**加 `--s3-force-path-style`，region 填任意值即可。

```bash
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage s3 \
  --s3-bucket my-bucket \
  --s3-endpoint http://minio.local:9000 \
  --s3-region us-east-1 \
  --s3-access-key minioadmin \
  --s3-secret-key minioadmin \
  --s3-force-path-style
```

---

## AWS S3

无需 `--s3-endpoint`，SDK 自动路由。

```bash
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage s3 \
  --s3-bucket my-bucket \
  --s3-region us-east-1 \
  --s3-access-key <ACCESS_KEY_ID> \
  --s3-secret-key <SECRET_ACCESS_KEY>
```

---

## Cloudflare R2

`--s3-region` 固定填 `auto`，endpoint 中含 Account ID（在 Cloudflare Dashboard → R2 页面查看）。

```bash
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage s3 \
  --s3-bucket my-bucket \
  --s3-endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com \
  --s3-region auto \
  --s3-access-key <R2_ACCESS_KEY_ID> \
  --s3-secret-key <R2_SECRET_ACCESS_KEY>
```

---

## 阿里云 OSS

> ⚠️ S3 兼容 endpoint 有 `s3.` 前缀，与原生 OSS SDK 的入口不同，请勿混用。

```bash
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage s3 \
  --s3-bucket my-bucket \
  --s3-endpoint https://s3.oss-cn-hangzhou.aliyuncs.com \
  --s3-region cn-hangzhou \
  --s3-access-key <AccessKeyId> \
  --s3-secret-key <AccessKeySecret>
```

常用 region / endpoint 对照：

| 地域 | endpoint |
|------|----------|
| 华东1（杭州） | `s3.oss-cn-hangzhou.aliyuncs.com` |
| 华北2（北京） | `s3.oss-cn-beijing.aliyuncs.com` |
| 华东2（上海） | `s3.oss-cn-shanghai.aliyuncs.com` |
| 华南1（深圳） | `s3.oss-cn-shenzhen.aliyuncs.com` |

**禁止**设置 `--s3-force-path-style`，OSS 仅支持 virtual-hosted style。

---

## 腾讯云 COS

> ⚠️ Bucket 名称必须包含 APPID，格式为 `BucketName-APPID`（如 `my-backup-1250000000`）。

```bash
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage s3 \
  --s3-bucket my-backup-1250000000 \
  --s3-endpoint https://cos.ap-guangzhou.myqcloud.com \
  --s3-region ap-guangzhou \
  --s3-access-key <SecretId> \
  --s3-secret-key <SecretKey>
```

常用 region / endpoint 对照：

| 地域 | endpoint |
|------|----------|
| 广州 | `cos.ap-guangzhou.myqcloud.com` |
| 北京 | `cos.ap-beijing.myqcloud.com` |
| 上海 | `cos.ap-shanghai.myqcloud.com` |
| 成都 | `cos.ap-chengdu.myqcloud.com` |

---

## 火山云 TOS

> ⚠️ 禁止设置 `--s3-force-path-style`，TOS 不支持 Path Style（报 `InvalidPathAccess`）。

```bash
npx dify-dsl-pipe export --url <URL> --token <TOKEN> \
  --storage s3 \
  --s3-bucket my-bucket \
  --s3-endpoint https://tos-cn-beijing.volces.com \
  --s3-region cn-beijing \
  --s3-access-key <AccessKey> \
  --s3-secret-key <SecretKey>
```

常用 region / endpoint 对照：

| 地域 | endpoint |
|------|----------|
| 华北2（北京） | `tos-cn-beijing.volces.com` |
| 华南1（广州） | `tos-cn-guangzhou.volces.com` |
| 华东2（上海） | `tos-cn-shanghai.volces.com` |

---

## 配置文件方式

多实例场景下推荐在 `dify-pipe.yaml` 中配置存储，避免每次重复输入参数：

```yaml
profiles:
  prod-local:
    instance: prod
    storage:
      type: local
      path: "./backup/prod"

  prod-oss:
    instance: prod
    storage:
      type: s3
      bucket: "my-dify-backups"
      endpoint: "https://s3.oss-cn-hangzhou.aliyuncs.com"
      region: "cn-hangzhou"
      accessKeyId: "YOUR_ACCESS_KEY"
      secretAccessKey: "YOUR_SECRET_KEY"

  prod-minio:
    instance: prod
    storage:
      type: s3
      bucket: "dify"
      endpoint: "http://minio.internal:9000"
      region: "us-east-1"
      accessKeyId: "minioadmin"
      secretAccessKey: "minioadmin"
      forcePathStyle: true
```

详细字段说明见 [配置文件参考](config-file.md)。
