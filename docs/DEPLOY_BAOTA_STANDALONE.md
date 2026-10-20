# ZeroDrive 宝塔面板分开部署

本文适用于 Ubuntu + 宝塔 Nginx：后端由 Python 运行在 `127.0.0.1:8000`，前端构建产物由宝塔 Nginx 直接提供。

## 前端

```bash
cd /www/wwwroot/zerodrive/frontend
npm ci
npm run build
```

在宝塔中把站点根目录设为：

```text
/www/wwwroot/zerodrive/frontend/dist
```

## 后端

```bash
cd /www/wwwroot/zerodrive/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/migrate.py
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

生产环境请在宝塔的 Python 项目管理器或 systemd 中托管最后一条命令，并把运行目录设为 `/www/wwwroot/zerodrive/backend`，使后端能读取 `backend/.env`。

## 宝塔 Nginx 配置

在站点的 `server { ... }` 内保留宝塔生成的 SSL 配置，并使用下面两个 `location`：

```nginx
client_max_body_size 1100m;
client_body_timeout 3600s;

location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

`try_files $uri $uri/ /index.html;` 是 React 路由必需的回退规则。如果缺少它，首页可以打开，但直接访问或刷新 `/s/<token>`、`/share-links` 等地址时 Nginx 会返回 404。

如果宝塔已生成 `location /` 或反向代理规则，应替换它，不要再添加一个同名 `location`。保存后使用宝塔的配置检查和重载功能。

## 验收

```bash
curl http://127.0.0.1:8000/api/health
curl -I https://zerodrive.wuziran.fun/
curl -I https://zerodrive.wuziran.fun/s/test-token
```

最后一条应返回前端 HTML（通常是 `200`），然后由前端显示“分享链接不存在”；不应显示 Nginx 404 页面。
