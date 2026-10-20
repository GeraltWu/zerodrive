# ZeroDrive 后端

## 首次运行 / Schema 变更后

```bash
cd backend
cp .env.example .env   # 按需编辑账号、路径、JWT_SECRET
python scripts/migrate.py   # 执行数据库迁移（幂等，可多次执行）
conda activate zero_drive
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

确保已安装 `pyproject.toml` 中的依赖（例如在 conda 环境中 `pip install -e .`）。
媒体元数据抽取依赖 `ffprobe`（FFmpeg 套件的一部分）。Docker 镜像会自动安装并校验它；直接运行后端时，需要在宿主机安装并确保可执行 `ffprobe -version`。

## 环境变量

见 `.env.example`：`FILES_DIR`、`DATABASE_DIR`、管理员与 JWT、`CORS_ORIGINS`。SQLite 文件名固定为 `zerodrive.db`。

### 存储：与 MinIO / S3 如何对接

**运行时一律读 SQLite 表 `storage_backends`**（endpoint、region、桶名、path-style、**access_key_id / secret_access_key**、**sse_mode**）。与正式环境一致：改连接不必改 `.env` 发版。

- **凭证**：优先用表里的 `access_key_id` + `secret_access_key`；若均为空，则使用进程环境变量 **`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`**（适合 EC2 角色等，不把密钥进库）。
- **`.env` 里以 `S3_*` 开头的项**：仅在 **`storage_backends` 尚为空** 时，由启动种子写入上述表（含把 `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_SSE` 写入对应列）。表已有数据后，**改 `.env` 不会更新表里已存在的后端**。

文件元数据在 **`blobs` + `nodes.blob_id`**；旧版 `storage_key` 会在启动时一次性迁移并删除列（需 **SQLite 3.35+**）。

### 已部署 MinIO 时，在应用里要配什么

1. 在 MinIO 控制台建好 **Bucket**（例如 `zerodrive`）。
2. 在数据库 **`storage_backends`** 中，保证有一条 **S3 兼容**后端（`provider` 为 `generic_s3` / `minio` 等），且 **`is_default = 1`**，并填写例如：

   | 列 | 示例 |
   |---|------|
   | `endpoint_url` | `http://127.0.0.1:9000`（或你的 MinIO API 地址） |
   | `region` | `us-east-1`（MinIO 常可随意填） |
   | `use_path_style` | `1`（MinIO 多为 path-style） |
   | `default_bucket` | 与 MinIO 上桶名一致 |
   | `access_key_id` / `secret_access_key` | MinIO 用户密钥（或留空改用 `AWS_*` 环境变量） |
   | `sse_mode` | 留空；需要 SSE-S3 时填 `aes256` |

3. 重启或热读库后即可上传测试。

**空库第一次**：在 `.env` 设 `STORAGE_DRIVER=s3` 并填 `S3_ENDPOINT_URL`、`S3_BUCKET` 等，可选填 `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`，启动一次即种子进表。之后以表为准。

**已有库**：用 SQLite 客户端执行 `UPDATE storage_backends SET ... WHERE id='...'` 更新上述列；切换默认后端则改 `is_default`。

### 连接测试脚本

在 `backend` 目录执行（需已 `pip install -e .`，且库里已有 **默认非 local** 后端并配置好桶与凭证）：

```bash
cd backend
python scripts/test_minio_connection.py
```

脚本会按默认 S3 后端做一次 **上传 → 读取校验 → 删除**，并列出 `zerodrive-healthcheck/` 前缀下少量对象键。

### 已有数据如何迁移（只做一次）

适用于升级前：**只有 `nodes.storage_key`、文件在 `FILES_DIR` 下** 的旧版。

1. **备份**：复制 `DATABASE_DIR/zerodrive.db` 和整个 `FILES_DIR`（磁盘上的 UUID 文件名不要动）。
2. **升级代码与依赖**后启动后端一次：会 **种子 `storage_backends`（若表为空）** → **迁移 `storage_key` → `blobs`** → **删除 `storage_key` 列**。
3. 迁移完成后，**物理文件路径不变**：`blobs.object_key` 等于原来的 `storage_key`，仍指向 `FILES_DIR` 下同一相对路径。
4. 若 SQLite 过旧无法 `DROP COLUMN`，需自行升级 SQLite / Python 环境，或手工用「建新表拷贝数据」方式去掉 `storage_key` 列后再启动。

若旧数据已在对象存储、仅有库没有 `storage_key`，需另写脚本按 `docs/STORAGE_ARCHITECTURE.md` 往 `blobs` 插行并更新 `nodes.blob_id`，不在上述自动流程内。

更多设计见 `docs/STORAGE_ARCHITECTURE.md`。

## Bot 集成（QQ 机器人）

先调用 `/api/auth/login` 获取 JWT，之后所有接口带 JWT 即可。

文件路径统一使用绝对路径，`/` 为根目录：

- `GET /api/bot/resolve-path?path=/图片/奶龙`
- `GET /api/bot/random-file?path=/语音/早安&mime_prefix=audio/`
- `GET /api/bot/random-file?path=/图片/奶龙.png&mime_prefix=image/`
- `GET /api/bot/files/{node_id}/content?签名参数`

## 下载接口说明

`GET /api/nodes/{node_id}/download` 要求登录，可使用浏览器的 HttpOnly 会话 Cookie 或 `Authorization: Bearer <token>`。网页中的预览和下载按钮仍可直接打开该地址。

需要发给他人“一点即下载”的地址时，先创建公开分享链接，再使用 `GET /api/public/share/{token}/download`。该直链可停用，并支持过期时间、访问次数限制和访问记录。

Bot 发图请使用 **`GET /api/bot/files/{node_id}/content`**（签名 URL），见 [`docs/zerodrive-API.md`](../docs/zerodrive-API.md) 第 4.5 节。
