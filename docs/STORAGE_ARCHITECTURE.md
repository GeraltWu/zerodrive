# ZeroDrive 对象存储与基础设施设计

本文档描述网盘 **blob 与元数据分离**、**S3 兼容对象存储**、**可插拔存储后端** 的一体化架构思路，以及 **各服务器上的操作清单**。面向扩展：多桶、多后端、分片上传、预签名直传、异步清理与后续去重/版本等能力。

## 实现状态（后端）

已实现第一期能力（以代码为准）：

- 表 `storage_backends`、`blobs`；`nodes.blob_id`；**不再使用 `nodes.storage_key`**。旧库启动时一次性：将仍存在的 `storage_key` 迁入 `blobs` 并 `UPDATE nodes.blob_id`，随后 **`ALTER TABLE nodes DROP COLUMN storage_key`**（需 SQLite 3.35+）。
- 驱动：`local`（`FILES_DIR`）、`generic_s3` / `minio` / `aws` / `aliyun`（boto3 S3 兼容 API）。**S3 连接参数与静态密钥以 `storage_backends` 表为准**；密钥列为空时使用环境变量 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`（如实例角色场景）。空库种子时可将 `.env` 中 `S3_*` 写入表，见 `backend/README.md`。
- 上传经默认 `storage_backend` 写入；下载本地仍用 `FileResponse`（含 Range），S3 用流式 `StreamingResponse` 并转发 `Range`。
- 删除子树时维护 `blobs.refcount`，为 0 时删对象。
- 未实现：`multipart_uploads` 表与分片 API、预签名直链、异步 GC 队列（当前在请求路径内 `purge`）。

**已有仅 `storage_key` 的数据**：见 `backend/README.md`「已有数据如何迁移」。空库首次启动时根据 `STORAGE_DRIVER` 种子默认后端；**已有 `storage_backends` 行时不再改种子**。详见 `backend/.env.example`。

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| 应用与数据库同机可部署 | API 与关系型数据库部署在一台或多台应用服务器；大文件不依赖应用机本地盘持久化。 |
| 存储独立扩展 | 文件字节仅存对象存储集群；横向扩展由 MinIO / 云 OSS 承担。 |
| 元数据与内容解耦 | 用户目录树与「物理对象」分离，便于引用计数、版本、去重、多后端迁移。 |
| 接口一步到位 | 业务只依赖 Blob 领域服务与 Storage Driver，避免业务层散落厂商 SDK。 |
| 运维可观测 | 分片、删除、GC、跨服务追踪可度量、可告警。 |

---

## 2. 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  API / 业务（鉴权、目录、配额、分享）                            │
├─────────────────────────────────────────────────────────────┤
│  Blob 领域服务（上传会话、分片、完成、删除、预签名、引用计数）    │
├─────────────────────────────────────────────────────────────┤
│  Storage Driver（S3 兼容；未来可接 Azure Blob / GCS 适配层）    │
└─────────────────────────────────────────────────────────────┘
          │                                   │
          ▼                                   ▼
   关系型数据库（元数据）                 对象存储（字节）
```

**原则**

- 业务与路由层 **不直接** 调用 `boto3`/`minio` 细节，统一经 **Blob 服务** 暴露的稳定接口（流式上传/下载、Head、Delete、Multipart、Presign）。
- **Driver** 按 `storage_backends` 记录选择 endpoint、credentials、path_style 等。

---

## 3. 数据模型

### 3.1 `nodes`（目录树 / 用户可见节点）

表示用户可见的树结构，与物理存储位置解耦。

建议字段（在现有基础上演进）：

| 字段 | 说明 |
|------|------|
| `id` | 节点 UUID |
| `parent_id` | 父文件夹 |
| `name` | 展示名 |
| `is_folder` | 是否文件夹 |
| `mime_type` | 文件 MIME（文件夹可为空） |
| `updated_at` | 更新时间 |
| `blob_id` | **外键 → `blobs.id`**；文件夹为 `NULL` |
| 可选 | `deleted_at` 软删、`quota_bytes` 缓存等 |

**旧版升级**：若库中曾存在 `storage_key` 列，由启动流程一次性写入 `blob_id` 并 **DROP COLUMN `storage_key`**（实现见 `storage_bootstrap.py`）。

### 3.2 `blobs`（物理对象，一行 = 存储上的一份字节）

| 字段 | 说明 |
|------|------|
| `id` | 主键 UUID |
| `storage_backend_id` | 外键 → `storage_backends` |
| `bucket` | 桶名（支持多桶、灰度、分租户前缀策略） |
| `object_key` | S3 对象键，在 `(backend, bucket)` 内唯一 |
| `size` | 字节数 |
| `content_sha256` | 可选；去重、完整性校验、迁移对账 |
| `etag` | 上传完成后对象存储返回的 ETag |
| `version_id` | 若桶开启 Versioning，记录版本 ID |
| `storage_class` | STANDARD / IA / GLACIER 等 |
| `refcount` 或独立关联表 | 多少 `nodes` 指向该 blob；为 0 时由 GC 删对象 |
| `created_at` | 创建时间 |

**语义**：多个 `nodes` 可指向同一 `blob_id`（硬链、秒传去重、内部复制），删除节点时递减引用，**异步任务**在引用为 0 时调用 `DeleteObject`。

### 3.3 `storage_backends`（逻辑存储端）

避免把 endpoint 写死在全局环境变量；支持多集群、迁移、只读归档源。

| 字段 | 说明 |
|------|------|
| `id` | 主键 |
| `name` | 人类可读名称 |
| `provider` | `minio` / `aws` / `aliyun` / `generic_s3` 等 |
| `endpoint_url` | API 地址（内网优先） |
| `region` | 区域 |
| `use_path_style` | 是否 path-style（MinIO 常见） |
| `default_bucket` | 默认桶（可被 `blobs.bucket` 覆盖） |
| `access_key_id` / `secret_access_key` | 可选；MinIO/静态密钥；生产可留空改用运行环境 `AWS_*` 或实例角色 |
| `sse_mode` | 可选；`aes256` 表示上传使用 SSE-S3 |
| `secret_ref` | 保留字段，当前实现以表内凭证 / 环境变量为准 |
| `is_readonly` | 是否仅用于读（例如旧集群迁出阶段） |
| `is_default` | 新上传默认后端标记 |

凭证：**优先**写入 `access_key_id` / `secret_access_key`（与正式「配置在库」一致）；**留空**时由运行环境的 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 或实例角色提供（不把密钥写入 SQLite）。

### 3.4 `multipart_uploads`（大文件分片）

| 字段 | 说明 |
|------|------|
| `id` | 内部主键 |
| `storage_upload_id` | S3 Multipart UploadId |
| `storage_backend_id` / `bucket` / `object_key` | 定位对象 |
| `node_draft_id` 或 `temp_blob_id` | 与未完成节点或草稿关联 |
| `status` | `in_progress` / `completed` / `aborted` |
| `expires_at` | 用于定时清理未完成分片 |
| `parts_json` 或子表 | 已上传分片 ETag 列表（Complete 时需要） |

定时任务：扫描过期 `in_progress`，调用 `AbortMultipartUpload` 并删除草稿元数据。

---

## 4. 核心流程

### 4.1 上传（服务端流式）

1. 鉴权与父目录校验；预创建 `blob` 行（或占位）与 `node` 草稿（可选）。
2. 选择 `storage_backend`（默认或策略）；生成 `object_key`（建议 UUID，可加 `tenant_id/` 前缀）。
3. **流式** `PutObject` 或通过分片 API 写入 Driver。
4. 成功后写入 `etag`、`size`，提交 `node` ↔ `blob` 绑定；**事务边界**需与团队约定：常见为「存储成功 → 再提交 DB」或二阶段「complete」接口。

### 4.2 分片上传

1. `CreateMultipartUpload` → 持久化 `multipart_uploads`。
2. 客户端多次上传分片（每片可 **预签名 URL**，浏览器直传对象存储）。
3. `CompleteMultipartUpload` → 更新 `blobs` / `nodes`，标记上传记录完成。

### 4.3 下载

- **代理模式**：API `GetObject` 流式转发给客户端；实现简单，占用应用带宽。
- **预签名模式**：API 返回短时有效的 `GET` URL，客户端直连对象存储；需在桶上配置 **CORS**（浏览器场景）。

### 4.4 删除与 GC

1. 用户删除文件：删除或软删 `node`，**递减** `blob.refcount`（或通过关联表计数）。
2. 异步 worker：`refcount == 0` 时 `DeleteObject`（若开 Versioning，需约定是否打删除标记及是否记录 `version_id`）。
3. **孤儿对象**：定时扫描「存储存在但 DB 无引用」的对象（需清单策略，如仅扫描带业务前缀的 key）；未完成分片由 `multipart_uploads` 过期策略处理。

---

## 5. 安全

- **最小权限 IAM / 策略**：专用用户仅目标桶的 `s3:GetObject`、`s3:PutObject`、`s3:DeleteObject`、`s3:AbortMultipartUpload`、`s3:ListMultipartUploadParts` 等。
- **凭证**：生产优先 **实例角色 / Workload Identity**；自建 MinIO 用独立 Access Key，定期轮换。
- **传输**：对象存储与管理面 **TLS**；应用与存储 **内网** 或专线。
- **加密**：桶默认 **SSE-S3** 或 **SSE-KMS**；合规要求在 `blobs` 或配置中记录 `kms_key_id`。
- **桶策略**：禁止公开 `ListBucket`；下载走鉴权 API 或短 TTL 预签名。

---

## 6. 可观测与运维

- **指标**：上传/下载 QPS、字节量、分片失败率、Driver 延迟、GC 队列深度、未完成分片数量。
- **日志/追踪**：请求贯穿 `request_id`、`node_id`、`blob_id`、`object_key`，便于排障。
- **备份**：数据库定期快照；对象存储启用 **版本控制** 或 **跨区域复制**；书面恢复演练流程。

---

## 7. 演进与实现阶段建议

| 阶段 | 内容 |
|------|------|
| 第一期 | `storage_backends` + `blobs` + `nodes.blob_id`；Driver（S3 兼容）；服务端流式上传/下载；删除 + 基础 GC；`etag` 写入。 |
| 第二期 | 分片上传全链路 + 过期清理；预签名上传/下载；桶 CORS 与前端对接。 |
| 第三期 | `content_sha256` 去重与秒传；`storage_class` / 归档；多云 Driver。 |

模型与表结构在第一期按最终形态落地，功能可分阶段开发，避免再次拆表。

---

## 8. 各服务器操作清单

以下按常见拓扑：**服务器 A（应用 + 数据库）**、**服务器 B 组（对象存储，如 MinIO 分布式或云 OSS 无自建机）**。

### 8.1 服务器 A：应用 + 数据库

| 步骤 | 操作 |
|------|------|
| 1 | 安装运行时（如 Python 虚拟环境）、部署 ZeroDrive API 进程（或容器）。 |
| 2 | 部署关系型数据库（可与 A 同机或独立 RDS）；执行迁移脚本创建 `storage_backends`、`blobs`、`multipart_uploads` 及对 `nodes` 的变更。 |
| 3 | 配置 **非明文** 凭证：环境变量、K8s Secret、或密钥管理服务；包含默认 `storage_backend` 解析所需字段。 |
| 4 | **网络**：确保 A 能访问对象存储 **API 端口**（HTTPS，内网 DNS 优先）；防火墙 **仅放行** A（及运维堡垒机）访问存储管理面（按需）。 |
| 5 | 若使用 **预签名直链**：前端浏览器域名需在对象存储桶 **CORS** 中允许；API 负责签发并控制 TTL。 |
| 6 | 部署 **异步 worker**（GC、分片清理、迁移任务）可同机或独立小实例，需同库与同存储网络可达。 |
| 7 | **停用本地大文件目录**：新上传不再写 `FILES_DIR` 下 blob；旧数据按第 9 节迁移后下线本地盘或只读保留。 |

### 8.2 服务器 B：自建 MinIO（或多节点集群）

| 步骤 | 操作 |
|------|------|
| 1 | 按官方文档规划 **磁盘与纠删码**；多节点时完成集群初始化与统一 **console/API endpoint**。 |
| 2 | 配置 **TLS 证书**（生产域名或内网证书）。 |
| 3 | 创建 **业务桶**（名称与 `storage_backends.default_bucket` / `blobs.bucket` 一致）。 |
| 4 | 创建 **专用 Access Key**，策略绑定为仅上述桶的必需操作（见第 5 节）。 |
| 5 | 将 **endpoint**、**region**、**path_style**、**凭证引用方式** 登记到 A 的配置或 `storage_backends` 初始化数据中。 |
| 6 | （可选）开启 **Versioning**、**生命周期**（旧版本过期）、**桶复制**（灾备）。 |
| 7 | **安全组/防火墙**：仅允许 A（及 worker）访问 S3 API 端口；Console 不对公网开放或强认证 + IP 限制。 |

### 8.3 云厂商对象存储（无自建 B 机）

| 步骤 | 操作 |
|------|------|
| 1 | 在控制台 **创建桶**，选择区域；建议 **禁止公共读**。 |
| 2 | 创建 **RAM / IAM 用户** 或 **OIDC/实例角色**，附加最小权限策略。 |
| 3 | 记录 **Endpoint**（外网/内网）、**Region**；阿里云等注意 **Signature 版本** 与 SDK 配置。 |
| 4 | 在 A 上使用 **内网 Endpoint**（同区域）以降低费用与延迟。 |
| 5 | 配置 **CORS**（若浏览器直连上传/下载）。 |
| 6 | 将 `provider`、`endpoint_url`、`region`、`default_bucket`、`secret_ref` 写入 `storage_backends` 或等价配置。 |

### 8.4 客户端 / 用户侧

- 无特殊服务器；浏览器需信任 HTTPS 证书。  
- 若直传对象存储：需处理 **预签名过期重试**、**分片失败重传单分片**。

---

## 9. 从当前本地存储迁移

1. **B**：桶与权限就绪（见 8.2 / 8.3）。  
2. **A**：插入 `storage_backends` 默认记录；部署支持 Driver 的应用版本。  
3. **迁移脚本**（在可访问旧 `FILES_DIR` 的机器上运行，通常为 A 或挂载旧盘的迁移机）：
   - 遍历现有带 `storage_key` 的节点；对每个文件 `PutObject` 到目标桶，`object_key` 可与现 `storage_key` 相同以便映射；  
   - 创建对应 `blobs` 行并更新 `nodes.blob_id`，最后切换读写到新路径。  
4. **校验**：抽样比对 `size` 与远端 `HeadObject`；必要时比对 ETag。  
5. **灰度**：可双写短时间或读新失败回退旧盘；稳定后旧目录只读备份再删除。  
6. **回滚**：保留旧数据与 DB 备份直至观察期结束。

---

## 10. 与现有代码的对应关系（实现时）

- `backend/app/services/storage.py`：本地 Driver 使用的 `FILES_DIR` 路径工具。
- `backend/app/services/storage_drivers/`：S3 兼容驱动；**凭证来自 `storage_backends` 表列，或 `AWS_*` 环境变量**。  
- `backend/app/services/storage_bootstrap.py`：列迁移、空库种子（可把 `.env` 中 `S3_*` 写入表）、旧 `storage_key` 迁移。  
- `backend/app/services/node_service.py`：上传/下载/删除经 Driver，写 `blobs` 与 `nodes.blob_id`。  
- `backend/scripts/test_minio_connection.py`：按默认 S3 后端连通性自测。  
- 媒体元信息：本地路径或 S3 临时文件 + `ffprobe`。

---

## 11. 文档维护

- 架构变更（新表、新后端类型）应同步更新本文档与 `docs/API.md` 中上传/下载相关说明。  
- 服务器操作 checklist 随实际云厂商/MinIO 版本微调时，在本节追加「变更记录」子段即可。

---

*文档版本：与对象存储一体化设计初稿一致；后续实现以代码与迁移脚本为准。*
