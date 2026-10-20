#!/bin/bash
set -e

echo ">>> 运行数据库迁移..."
python scripts/migrate.py

echo ">>> 启动 ZeroDrive 后端..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
