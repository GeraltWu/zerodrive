#!/usr/bin/env python3
"""
使用 ZeroDrive 库里的默认 S3 后端（storage_backends 表）连接 MinIO/S3，做一次 list + 小文件读写删。

用法（在 backend 目录下）:
  cd backend
  python scripts/test_minio_connection.py

依赖: 已 pip install -e . ，且 SQLite 中已有 is_default=1 的 S3 类后端，并填好
  endpoint_url / default_bucket / access_key_id / secret_access_key（或仅依赖 AWS_* 环境变量）。
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid

# 保证以 backend 为工作区导入 app
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)
os.chdir(_BACKEND_ROOT)


async def _main() -> int:
    from dotenv import load_dotenv

    load_dotenv()

    import app.models.storage  # noqa: F401 — 注册 ORM
    from sqlalchemy import select

    from app.core.config import get_settings
    from app.db.session import AsyncSessionLocal
    from app.models.storage import StorageBackend
    from app.services.storage_drivers.s3 import S3StorageDriver

    get_settings.cache_clear()
    _ = get_settings()  # 加载 .env 中的 FILES_DIR / DATABASE_DIR 等

    async with AsyncSessionLocal() as session:
        res = await session.execute(
            select(StorageBackend).where(
                StorageBackend.is_default.is_(True),
                StorageBackend.provider != "local",
            )
        )
        backend = res.scalar_one_or_none()
        if backend is None:
            print(
                "未找到默认的非 local 存储后端。请在 storage_backends 中设置一条 S3 兼容后端并 is_default=1。"
            )
            return 1

    print("后端:", backend.id, backend.name, backend.provider)
    print("endpoint:", backend.endpoint_url or "(AWS 默认)")
    print("region:", backend.region)
    print("bucket:", backend.default_bucket or "(未设置)")
    print("path_style:", backend.use_path_style)

    driver = S3StorageDriver(backend)
    bucket = backend.default_bucket.strip()
    key = f"zerodrive-healthcheck/{uuid.uuid4()}.txt"
    payload = b"zerodrive minio test ok\n"

    def _write_read_delete() -> None:
        client = driver._client  # noqa: SLF001 — 测试脚本直连 client
        client.put_object(Bucket=bucket, Key=key, Body=payload)
        out = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if out != payload:
            raise RuntimeError("get_object 内容与写入不一致")
        client.delete_object(Bucket=bucket, Key=key)

    try:
        await asyncio.to_thread(_write_read_delete)
    except Exception as e:
        print("失败:", repr(e))
        return 2

    print("list_objects_v2 (prefix zerodrive-healthcheck/) …")
    resp = await asyncio.to_thread(
        driver._client.list_objects_v2,  # noqa: SLF001
        Bucket=bucket,
        Prefix="zerodrive-healthcheck/",
        MaxKeys=5,
    )
    n = resp.get("KeyCount", 0)
    print("  返回条数(<=5):", n)
    print("OK: 上传、读取、删除成功。")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(_main()))
    except KeyboardInterrupt:
        raise SystemExit(130) from None
