# ZeroDrive HTTP API 说明

本文档描述 ZeroDrive 后端（FastAPI）对外暴露的接口，供其它系统集成时参考。实际部署时请将 `{BASE_URL}` 替换为服务根地址（例如 `http://localhost:8000`）。

---

## 1. 通用约定

### 1.1 路径前缀

除「文件下载」外，本文列出的接口均以 `/api` 为前缀（例如：`GET {BASE_URL}/api/auth/me`）。

### 1.2 JSON 响应包络

除 **下载文件** 接口外，返回 JSON 的接口均采用统一外层结构：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {}
}
```

**说明：**

- `code`：`0` 表示成功；非 `0` 表示失败（可能为 HTTP 状态码或业务码，见 1.5）。
- `msg`：提示文案。
- `data`：成功时为业务数据；失败时可能为 `null` 或附带详情（如校验错误列表）。

### 1.3 认证

需要登录的接口在请求头携带：

```http
Authorization: Bearer <access_token>
```

**说明：** `access_token` 来自 `POST /api/auth/login` 的响应。浏览器登录还会设置 HttpOnly 会话 Cookie，因此页面内的媒体预览和下载无需自行拼接请求头。外部程序继续使用 Bearer Token。校验失败时多为 **401**，响应体仍为上述包络。

**Bot 集成（QQ 机器人等）** 同样使用 JWT 认证，流程见 **第 4 节**。

### 1.4 内容类型

- JSON 请求：`Content-Type: application/json`
- 上传文件：`Content-Type: multipart/form-data`（字段见对应接口）

### 1.5 常见错误响应中的 `code`

```json
{
  "code": 401,
  "msg": "未登录",
  "data": null
}
```

**说明（典型取值）：**

| `code`（典型） | HTTP 状态 | 含义 |
|----------------|-----------|------|
| `400` | 400 | 节点业务校验失败 |
| `401` | 401 | 未登录、Token 无效或用户不存在 |
| `404` | 404 | 节点不存在 |
| `409` | 409 | 资源冲突（如重名） |
| `40002` | 400 | Bot 路径参数非法（第 4 节） |
| `40402` | 404 | Bot 路径不存在 |
| `40403` | 404 | Bot 目标文件夹内无符合条件文件 |
| `422` | 422 | 请求体验证失败，`data` 内为字段错误列表 |

其它情况 `code` 常与 HTTP 状态一致，`msg` 为可读说明。

### 1.6 节点对象 `NodeOut`（多处响应的 `data` 使用该形状）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "parent_id": "00000000-0000-4000-8000-000000000001",
  "name": "example.txt",
  "is_folder": false,
  "size": 1024,
  "mime_type": "text/plain",
  "meta_json": null,
  "updated_at": "2026-05-03T12:00:00+00:00"
}
```

**说明：**

- `parent_id`：父节点 ID；根下的节点其父为根 ID。
- `is_folder`：`true` 为文件夹；文件夹的 `size` 一般为 `0`。
- `mime_type` / `meta_json`：文件可能非空；文件夹多为 `null`。
- `updated_at`：ISO8601 字符串（带时区）。

根文件夹固定 ID：`00000000-0000-4000-8000-000000000001`。

---

## 2. 认证与用户

### 2.1 `POST /api/auth/register`

**说明：** 注册新用户。

**输入（Body）：**

```json
{
  "username": "newuser",
  "password": "secret12"
}
```

**说明：**

- `username`：长度 3～64；服务端会 `strip` 首尾空格。
- `password`：长度 6～128。
- 用户名已存在时 HTTP **409**，`msg` 为「用户名已存在」。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "username": "newuser"
  }
}
```

---

### 2.2 `POST /api/auth/login`

**说明：** 登录并获取 JWT。

**输入（Body）：**

```json
{
  "username": "admin",
  "password": "your-password"
}
```

**说明：** `username` 长度 1～64；`password` 长度 1～128。失败时 **401**（账号或密码错误）。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "access_token": "<JWT>",
    "token_type": "bearer",
    "username": "admin"
  }
}
```

**说明：** 后续请求将 `access_token` 放入 `Authorization: Bearer <JWT>`。

---

### 2.3 `POST /api/auth/logout`

**说明：** 登出占位（JWT 无状态）。**需要认证。**

**输入：** 无 Body。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": null
}
```

---

### 2.4 `GET /api/auth/me`

**说明：** 当前用户。**需要认证。**

**输入：** 无。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "username": "admin"
  }
}
```

---

## 3. 网盘节点

以下接口除单独说明外均需 **`Authorization: Bearer ...`**。

### 3.1 `GET /api/nodes/root`

**说明：** 返回根文件夹 ID。

**输入：** 无。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "id": "00000000-0000-4000-8000-000000000001"
  }
}
```

**说明：** `data.id` 与数据库根节点一致。

---

### 3.2 `GET /api/nodes/folders/tree`

**说明：** 全部文件夹扁平列表（含父子关系，供拼树）。

**输入：** 无。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "parent_id": null,
      "name": ""
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "parent_id": "00000000-0000-4000-8000-000000000001",
      "name": "Documents"
    }
  ]
}
```

**说明：** 根的 `parent_id` 为 `null`；仅包含文件夹。

---

### 3.3 `GET /api/nodes`

**说明：** 列出某目录下直接子节点。

**输入（Query，非 JSON Body）：**

```json
{
  "parent_id": "00000000-0000-4000-8000-000000000001"
}
```

**说明：** 实际请求为 `GET /api/nodes?parent_id=<父文件夹ID>`；`parent_id` 必填。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "parent_id": "00000000-0000-4000-8000-000000000001",
      "name": "readme.txt",
      "is_folder": false,
      "size": 256,
      "mime_type": "text/plain",
      "meta_json": null,
      "updated_at": "2026-05-03T12:00:00+00:00"
    }
  ]
}
```

**说明：** `data` 数组元素形状见 **1.6 NodeOut**。

---

### 3.4 `GET /api/nodes/{node_id}/breadcrumb`

**说明：** 从根到该节点的路径。

**输入（Path）：**

```json
{
  "node_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**说明：** 实际为路径占位符 `/api/nodes/<node_id>/breadcrumb`。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": [
    { "id": "00000000-0000-4000-8000-000000000001", "name": "" },
    { "id": "660e8400-e29b-41d4-a716-446655440001", "name": "Documents" },
    { "id": "550e8400-e29b-41d4-a716-446655440000", "name": "readme.txt" }
  ]
}
```

**说明：** 数组顺序为根 → 当前节点。

---

### 3.5 `POST /api/nodes/folder`

**说明：** 新建文件夹。

**输入（Body）：**

```json
{
  "parent_id": "00000000-0000-4000-8000-000000000001",
  "name": "New Folder"
}
```

**说明：** `name` 长度 1～512；`parent_id` 为父文件夹 ID。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "parent_id": "00000000-0000-4000-8000-000000000001",
    "name": "New Folder",
    "is_folder": true,
    "size": 0,
    "mime_type": null,
    "meta_json": null,
    "updated_at": "2026-05-03T12:00:00+00:00"
  }
}
```

**说明：** `data` 为 **NodeOut**，见 1.6。

---

### 3.6 `POST /api/nodes/upload`

**说明：** 上传文件。`multipart/form-data`，非单一 JSON Body。

**输入（逻辑字段，表单）：**

```json
{
  "parent_id": "00000000-0000-4000-8000-000000000001",
  "file": "<二进制，字段名 file>"
}
```

**说明：** 表单字段名：`parent_id`（文本）、`file`（文件）。`Content-Type` 由客户端自动生成（含 boundary）。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "id": "880e8400-e29b-41d4-a716-446655440003",
    "parent_id": "00000000-0000-4000-8000-000000000001",
    "name": "photo.jpg",
    "is_folder": false,
    "size": 204800,
    "mime_type": "image/jpeg",
    "meta_json": null,
    "updated_at": "2026-05-03T12:00:00+00:00"
  }
}
```

**说明：** `data` 为新建文件的 **NodeOut**。

---

### 3.7 `GET /api/nodes/{node_id}/download`

**说明：** 下载文件流；要求有效的浏览器会话 Cookie 或 `Authorization: Bearer <access_token>`，并检查节点访问权限；支持 Range（`206`）便于音视频拖动。

**输入（Path）：**

```json
{
  "node_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**输出：** 非 JSON 包络。成功时为二进制流：`Content-Type: application/octet-stream`，`Content-Disposition: attachment; filename="..."`。失败可能为 **400**（不能下载文件夹）、**404**（无内容）等，错误体格式以实际响应为准。

需要对外公开且点击即下载的链接时，创建分享链接后使用 `GET /api/public/share/{token}/download`。QQ Bot 使用第 4.5 节的短期签名下载地址。

---

### 3.8 `PATCH /api/nodes/{node_id}/rename`

**说明：** 重命名。

**输入（Path + Body）：**

```json
{
  "node_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "renamed.txt"
}
```

**说明：** `node_id` 在 URL 路径中；`name` 在 JSON Body 中，长度 1～512。

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "parent_id": "00000000-0000-4000-8000-000000000001",
    "name": "renamed.txt",
    "is_folder": false,
    "size": 256,
    "mime_type": "text/plain",
    "meta_json": null,
    "updated_at": "2026-05-03T12:05:00+00:00"
  }
}
```

---

### 3.9 `POST /api/nodes/{node_id}/reparse-meta`

**说明：** 重新解析/写入媒体元数据（服务端实现相关）。无 Body。

**输入（Path）：**

```json
{
  "node_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "parent_id": "00000000-0000-4000-8000-000000000001",
    "name": "clip.mp4",
    "is_folder": false,
    "size": 1048576,
    "mime_type": "video/mp4",
    "meta_json": {},
    "updated_at": "2026-05-03T12:10:00+00:00"
  }
}
```

**说明：** `meta_json` 是否填充取决于服务端解析结果。

---

### 3.10 `POST /api/nodes/{node_id}/move`

**说明：** 移动到目标文件夹。

**输入（Path + Body）：**

```json
{
  "node_id": "550e8400-e29b-41d4-a716-446655440000",
  "parent_id": "660e8400-e29b-41d4-a716-446655440001"
}
```

**说明：** URL 中的 `node_id` 为被移动节点；Body 中的 `parent_id` 为目标父文件夹 ID。

**输出：** `data` 为移动后的 **NodeOut**（示例结构同 1.6）。

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "parent_id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "readme.txt",
    "is_folder": false,
    "size": 256,
    "mime_type": "text/plain",
    "meta_json": null,
    "updated_at": "2026-05-03T12:15:00+00:00"
  }
}
```

---

### 3.11 `DELETE /api/nodes/{node_id}`

**说明：** 级联删除（含子树与存储文件）。

**输入（Path）：**

```json
{
  "node_id": "770e8400-e29b-41d4-a716-446655440002"
}
```

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": null
}
```

---

## 4. Bot 集成（QQ 机器人等）

面向自动化集成：按文件夹绝对路径随机取图或下载文件。与前端一样使用 JWT 认证（先调用 `POST /api/auth/login` 获取 `access_token`），文件归属到对应用户。

### 4.1 认证流程

Bot 代用户操作时：

1. 用户在 QQ 提供账号密码 → Bot 调用 `POST /api/auth/login` → 获取 JWT
2. Bot 存储 JWT（关联 QQ 号），后续所有请求带 `Authorization: Bearer <JWT>`
3. JWT 过期后提示用户重新绑定

### 4.2 路径参数 `path`

| 规则 | 说明 |
|------|------|
| 含义 | 以 `/` 开头的绝对路径，`/` 为根目录 |
| 文件夹模式 | 最后一段**无后缀**（如 `/图片/奶龙`）→ 解析为文件夹，在其中随机选取 |
| 文件模式 | 最后一段**有后缀**（如 `/语音/早安.mp3`）→ 精确匹配该文件 |
| 非法 | 不以 `/` 开头、空路径、`..`、反斜杠、控制字符 |
| 重名 | 同一父目录下存在多个同名文件夹 → **409** |

后缀判断：最后一段包含 `.` 且后缀长度 1~10 个字母数字（如 `.mp3`、`.png`），即视为文件路径。

根文件夹 ID 固定为 `00000000-0000-4000-8000-000000000001`（与 1.6 一致）。

### 4.3 `GET /api/bot/resolve-path`

**说明：** 将 `path` 解析为节点（文件或文件夹），校验路径是否存在。

**输入（Query）：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `path` | 是 | 如 `/图片/奶龙` 或 `/语音/早安.mp3` |

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "奶龙",
    "parent_id": "770e8400-e29b-41d4-a716-446655440002",
    "resolved_path": "/图片/奶龙"
  }
}
```

---

### 4.4 `GET /api/bot/random-file`

**说明：** 解析 `path`，根据有无后缀自动判断行为，返回文件信息及短期下载链接（机器人主入口）。

**输入（Query）：**

| 参数 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `path` | 是 | — | 文件夹或文件路径，如 `/语音/早安`（随机）或 `/语音/早安.mp3`（精确） |
| `mime_prefix` | 是 | — | `mime_type` 前缀匹配，如 `image/`、`audio/`、`video/` |
| `extensions` | 否 | — | 扩展名白名单，逗号分隔，如 `mp3,wav,ogg`；与 `mime_prefix` **满足其一**即可（仅随机模式生效） |

**行为：**
- path 最后一段**无后缀**（如 `/语音/早安`）→ 解析为文件夹，随机选一个匹配 `mime_prefix` + `extensions` 的文件
- path 最后一段**有后缀**（如 `/语音/早安.mp3`）→ 精确匹配该文件，跳过随机

**输出：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "node_id": "880e8400-e29b-41d4-a716-446655440003",
    "name": "01.jpg",
    "mime_type": "image/jpeg",
    "size": 204800,
    "folder": {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "resolved_path": "/图片/奶龙"
    },
    "download_url": "https://drive.example.com/api/bot/files/880e8400-e29b-41d4-a716-446655440003/content?sig=...&exp=...",
    "picked": "random"
  }
}
```

**说明：**
- `picked`：`"random"` 表示从文件夹随机选出，`"exact"` 表示精确匹配到文件
- `download_url` 含 `sig`、`exp`（Unix 秒），在有效期内可下载；过期返回 **403**

**错误：** `404` 路径不存在（`code` 可能为 `40402`）或文件夹内无符合条件文件（`40403`）；`409` 路径段重名。

---

### 4.5 `GET /api/bot/files/{node_id}/content`

**说明：** 下载文件二进制流；**非 JSON 包络**。

**认证：** 提供签名参数 `sig` + `exp`（由 `random-file` 的 `download_url` 提供）即可，无需额外请求头。

**输入（Path/Query）：** `node_id` 为文件节点 UUID；Query 携带 `sig`、`exp`。

**输出：** 成功时为文件流；`Content-Type` 优先使用节点 `mime_type`；支持 **Range**（`206`）。失败 **403**（签名无效或过期）/ **404**。

**NoneBot 典型流程：**

1. `GET /api/bot/random-file?path=/图片/奶龙&mime_prefix=image/`（带 JWT）
2. `GET {download_url}`（无需带 JWT，签名 URL 自包含）
3. 将字节作为图片消息发出  
