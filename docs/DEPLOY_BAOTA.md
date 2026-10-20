# ZeroDrive 宝塔面板 Docker 部署

本文采用以下链路：

```text
浏览器 / QQ Bot
       │ HTTPS :443
       ▼
宝塔 Nginx（证书、限流、反向代理）
       │ HTTP 127.0.0.1:8600
       ▼
ZeroDrive frontend 容器（静态页面、/api 代理）
       │ Docker 内部网络 :8000
       ▼
ZeroDrive backend 容器（FastAPI、SQLite、文件存储）
```

服务器安全组只需开放 80、443 和宝塔面板端口。ZeroDrive 的 8600 端口仅绑定到 `127.0.0.1`，无需对公网开放。

## 1. 准备服务器

1. 将域名 `zerodrive.wuziran.fun` 解析到服务器公网 IP。
2. 在宝塔软件商店安装 Nginx 和 Docker；确认终端执行 `docker compose version` 有输出。
3. 为文件和 Docker 数据预留足够磁盘空间。数据库与上传文件分别保存在 `/www/zerodrive-data/database` 和 `/www/zerodrive-data/files`。

## 2. 上传项目并配置环境变量

项目可通过 Git 拉取，或上传压缩包到 `/www/wwwroot/zerodrive`。不要上传本机的 `.env`、`node_modules`、`dist` 和测试数据库。

```bash
cd /www/wwwroot/zerodrive
cp .env.example .env
openssl rand -hex 32
install -d -m 750 /www/zerodrive-data/files /www/zerodrive-data/database
chmod 600 .env
```

复制随机输出作为 `JWT_SECRET`，随后编辑 `.env`：

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=替换为强密码
JWT_SECRET=替换为上一步生成的随机字符串
SESSION_COOKIE_SECURE=true

BOT_DOWNLOAD_EXPIRE_SECONDS=300

PORT=8600
HOST_FILES_DIR=/www/zerodrive-data/files
HOST_DATABASE_DIR=/www/zerodrive-data/database
CORS_ORIGINS=https://zerodrive.wuziran.fun
PUBLIC_BASE_URL=https://zerodrive.wuziran.fun
```

`PUBLIC_BASE_URL` 不要以 `/` 结尾。它决定 QQ Bot 收到的签名下载链接域名。`ADMIN_PASSWORD` 只在首次创建管理员时使用，数据库建立后修改 `.env` 不会重置已有管理员密码。

如果从早期配置升级，请删除根目录 `.env` 中原来的 `DATA_DIR` 或 `HOST_DATA_DIR`，改用 `HOST_FILES_DIR` 与 `HOST_DATABASE_DIR`。旧的 `DATA_ROOT` 和 `SQLITE_PATH` 同样不再使用。

## 3. 构建并启动

```bash
cd /www/wwwroot/zerodrive
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend
curl http://127.0.0.1:8600/api/health
```

健康检查应返回 `status: ok`。后端每次启动会先执行数据库迁移；首次构建需要从网络下载 Docker 基础镜像、Python 依赖和 FFmpeg，因此会比后续构建更久。宝塔专用 Compose 默认通过阿里云 Debian 镜像安装 FFmpeg、通过阿里云 PyPI 镜像安装 Python 包，并在构建阶段执行 `ffprobe -version` 校验。

### 使用宝塔 Docker GUI 创建 Compose 项目

部分宝塔版本的“创建编排”只提供项目名称和 Compose 内容，不提供工作目录。此时使用项目根目录中的 `docker-compose.baota.yml`，它已经把构建目录、`.env` 和数据挂载全部写成服务器绝对路径。

1. 确认代码位于 `/www/wwwroot/zerodrive`，根目录存在 `.env`。
2. 确认 `/www/zerodrive-data/files` 与 `/www/zerodrive-data/database` 已创建。
3. 打开“Docker → 容器编排（Compose）→ 创建编排”。
4. 项目名称填写 `zerodrive`。
5. 将 `/www/wwwroot/zerodrive/docker-compose.baota.yml` 的全部内容粘贴到 Compose 编辑框，然后创建并启动。

如果你的宝塔版本支持从文件导入，则直接选择 `docker-compose.baota.yml`。不要在没有工作目录的界面中粘贴普通 `docker-compose.yml`，因为其中的相对路径会以宝塔保存编排的目录为基准。

创建并启动后，容器列表应出现：

```text
zerodrive-backend
zerodrive-frontend
```

在 GUI 中可以完成启动、停止、重启、查看日志和资源占用。代码更新后需要选择“重新构建 / 重建 Compose 项目”；普通“重启”只会重启旧镜像，不会把新代码构建进去。若当前宝塔版本没有重建按钮，再在项目目录执行 `docker compose up -d --build`。

## 4. 在宝塔创建站点和反向代理

1. 在“网站”中新建 `zerodrive.wuziran.fun`，选择纯静态站点即可。
2. 打开站点设置 → 反向代理 → 添加反向代理。
3. 代理名称可填 `zerodrive`，目标 URL 填 `http://127.0.0.1:8600`，发送域名使用 `$host`，关闭代理缓存。
4. 在站点 Nginx 配置的 `server { ... }` 内加入：

```nginx
# 给 1 GiB 文件预留 multipart 表单开销。
client_max_body_size 1100m;
client_body_timeout 3600s;
```

5. 在宝塔生成的 `location / { ... }` 代理规则内加入或修改以下项。已有同名指令时替换原值，避免重复：

```nginx
proxy_request_buffering off;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
proxy_set_header X-Forwarded-Proto $scheme;
```

保存配置，让宝塔执行 Nginx 配置检查与重载。容器内 Nginx 同样已为 1 GiB 文件预留请求开销，并设置长上传超时。

## 5. 配置 HTTPS

进入站点设置 → SSL，申请 Let's Encrypt 或 LiteSSL 证书，部署后开启“强制 HTTPS”。确认服务器安全组和系统防火墙已放行 80、443。

使用下列地址验收：

```text
https://zerodrive.wuziran.fun/
https://zerodrive.wuziran.fun/api/health
```

首次登录账号为 `admin`，密码为首次启动时 `.env` 中的 `ADMIN_PASSWORD`。

## 6. QQ Bot 接入

QQ Bot 的基本调用顺序：

1. `POST https://zerodrive.wuziran.fun/api/auth/login`，提交网盘账号和密码，读取响应里的 `data.access_token`。
2. 调用 `/api/bot/resolve-path` 或 `/api/bot/random-file` 时携带 `Authorization: Bearer <access_token>`。
3. `/api/bot/random-file` 返回的 `data.download_url` 已包含签名和过期时间。QQ 客户端或下载器可直接访问该地址，无需再携带 JWT。
4. 下载地址默认 300 秒失效，可通过 `BOT_DOWNLOAD_EXPIRE_SECONDS` 调整。它适合临时发送；需要长期链接时，在网页中创建公开分享链接。

## 7. 更新

更新包含两个动作：先把新源码同步到服务器，再重新构建 Compose 项目。推荐通过 Git 管理源码：

```bash
cd /www/wwwroot/zerodrive
git pull
docker compose up -d --build --remove-orphans
docker compose ps
docker compose logs --tail=100 backend
curl https://zerodrive.wuziran.fun/api/health
```

如果不使用 Git，可在宝塔文件管理器中覆盖上传 `backend/`、`frontend/`、`docker-compose.yml` 等源码，但保留服务器现有的 `.env`。然后进入“Docker → 容器编排 → zerodrive”，选择“重新构建 / 重建项目”。普通“重启”不会重新构建镜像，仍然运行旧代码。

只修改一个服务时可以单独重建：

```bash
# 只更新前端
docker compose up -d --build frontend

# 只更新后端
docker compose up -d --build backend
```

构建成功后 Compose 会替换应用容器，并继续挂载 `HOST_FILES_DIR` 与 `HOST_DATABASE_DIR`。上传文件和 SQLite 数据库不在镜像内，因此重建不会清空数据。后端新容器启动时会自动执行数据库迁移，更新后应检查后端日志和健康检查。

## 8. 备份

数据库与上传文件位于两个独立目录。为了让 SQLite 与文件内容处于一致状态，备份时短暂停止后端，并一起归档它们的共同父目录：

```bash
cd /www/wwwroot/zerodrive
backup_dir="/www/backup/zerodrive/$(date +%F-%H%M%S)"
mkdir -p "$backup_dir"
docker compose stop backend
tar -C /www/zerodrive-data -czf "$backup_dir/zerodrive-data.tar.gz" .
docker compose start backend
```

可将这段脚本配置成宝塔计划任务，并把 `/www/backup/zerodrive` 同步到另一块磁盘或对象存储。恢复前应停止整个应用，再用同一份备份中的数据库和文件覆盖数据目录。

### 从单一宿主机目录迁移

如果已经使用过早期的 `HOST_DATA_DIR=/www/zerodrive-data` 配置，上传文件本来就在新的文件目录中，只需停机复制 SQLite 文件：

```bash
cd /www/wwwroot/zerodrive
docker compose down
install -d -m 750 /www/zerodrive-data/files /www/zerodrive-data/database
cp -a /www/zerodrive-data/zerodrive.db /www/zerodrive-data/database/zerodrive.db
```

随后在 `.env` 中删除 `HOST_DATA_DIR`，加入：

```dotenv
HOST_FILES_DIR=/www/zerodrive-data/files
HOST_DATABASE_DIR=/www/zerodrive-data/database
```

执行 `docker compose up -d --build`，确认账号和文件均正常后，可将父目录中旧的 `zerodrive.db` 留作短期回退备份。

### 从旧 Docker Volume 迁移

如果服务器以前已经使用 `zerodrive-data` Docker Volume，先从仍在运行的旧容器查询卷名，再停机复制：

```bash
old_volume="$(docker inspect zerodrive-backend --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}')"
echo "$old_volume"

cd /www/wwwroot/zerodrive
docker compose down
install -d -m 750 /www/zerodrive-data/files /www/zerodrive-data/database
docker run --rm \
  -v "$old_volume:/source:ro" \
  -v /www/zerodrive-data/files:/dest-files \
  -v /www/zerodrive-data/database:/dest-database \
  alpine sh -c 'cp -a /source/files/. /dest-files/ && cp -a /source/zerodrive.db /dest-database/zerodrive.db'

docker compose up -d --build
```

确认网页中的文件和账号均正常，并完成一次目录备份后，再考虑删除旧 Volume。迁移验证期间保留旧 Volume，便于回退。

## 9. 常用排查命令

```bash
docker compose ps
docker compose logs -f --tail=200 backend
docker compose logs -f --tail=200 frontend
curl -i http://127.0.0.1:8600/api/health
curl -i https://zerodrive.wuziran.fun/api/health
```

- 构建日志长期显示某个 `sha256` 层为 `0B / xxMB`：这是 Docker Hub 基础镜像拉取失败，还没有执行项目 Dockerfile。进入“Docker → 设置 → 修改加速 URL”，选择或填写可用的镜像加速地址，保存并重启 Docker；然后在“镜像”页面预先拉取 `python:3.11-slim-bookworm`、`node:22-alpine` 和 `nginx:alpine`，三者完成后再重新构建 Compose 项目。
- 构建日志长期停在 `Downloading ...whl`：这是 Python 包下载缓慢。确认使用的是 `docker-compose.baota.yml`，其中已通过 `PIP_INDEX_URL` 配置阿里云 PyPI 镜像；覆盖最新 `backend/Dockerfile` 和 Compose 文件后重新构建。
- 公网返回 502：检查两个容器状态，并从服务器本机访问 `127.0.0.1:8600`。
- 上传返回 413：检查宝塔站点与容器内 Nginx 的 `client_max_body_size`。
- 大文件上传中断：检查两层 Nginx 的请求体和代理超时。
- Bot 下载链接显示 HTTP 或指向错误域名：检查 `.env` 的 `PUBLIC_BASE_URL`，然后执行 `docker compose up -d` 重建后端容器。
- 登录成功后仍未登录：确认公网已启用 HTTPS，且 `SESSION_COOKIE_SECURE=true`。
