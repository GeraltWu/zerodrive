from __future__ import annotations

import os
import uuid

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.config import Settings
from app.models.storage import LOCAL_BACKEND_ID, S3_BACKEND_ID, Blob, StorageBackend
from app.models.node import Node


async def ensure_node_blob_id_column(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        rows = await conn.execute(text("PRAGMA table_info(nodes)"))
        col_names = {str(r[1]) for r in rows.fetchall()}
        if "blob_id" not in col_names:
            await conn.execute(text("ALTER TABLE nodes ADD COLUMN blob_id VARCHAR(36)"))


async def ensure_storage_backend_columns(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        rows = await conn.execute(text("PRAGMA table_info(storage_backends)"))
        col_names = {str(r[1]) for r in rows.fetchall()}
        if "access_key_id" not in col_names:
            await conn.execute(
                text("ALTER TABLE storage_backends ADD COLUMN access_key_id VARCHAR(512)")
            )
        if "secret_access_key" not in col_names:
            await conn.execute(
                text("ALTER TABLE storage_backends ADD COLUMN secret_access_key TEXT")
            )
        if "sse_mode" not in col_names:
            await conn.execute(text("ALTER TABLE storage_backends ADD COLUMN sse_mode VARCHAR(32)"))


def _env_seed_s3_credentials() -> tuple[str | None, str | None]:
    """空库种子时写入 DB 的密钥；仅读环境变量，与运行时分发一致。"""
    ak = (os.environ.get("S3_ACCESS_KEY_ID") or "").strip() or None
    sk = (os.environ.get("S3_SECRET_ACCESS_KEY") or "").strip() or None
    return ak, sk


def _env_seed_sse_mode() -> str | None:
    v = (os.environ.get("S3_SSE") or "").strip().lower()
    if v in ("aes256", "sse-s3", "s3"):
        return "aes256"
    return None


async def seed_storage_backends_if_empty(session: AsyncSession, settings: Settings) -> None:
    cnt = await session.scalar(select(func.count()).select_from(StorageBackend))
    if cnt and cnt > 0:
        return

    if settings.storage_driver == "s3":
        if not (settings.s3_bucket or "").strip():
            raise RuntimeError("storage_driver=s3 需要配置 s3_bucket")
        ak, sk = _env_seed_s3_credentials()
        sse = _env_seed_sse_mode()
        session.add(
            StorageBackend(
                id=LOCAL_BACKEND_ID,
                name="local-legacy",
                provider="local",
                endpoint_url=None,
                region="",
                use_path_style=False,
                default_bucket="",
                access_key_id=None,
                secret_access_key=None,
                sse_mode=None,
                secret_ref="db",
                is_readonly=True,
                is_default=False,
            )
        )
        session.add(
            StorageBackend(
                id=S3_BACKEND_ID,
                name="primary-s3",
                provider="generic_s3",
                endpoint_url=(settings.s3_endpoint_url or "").strip() or None,
                region=settings.s3_region or "us-east-1",
                use_path_style=settings.s3_use_path_style,
                default_bucket=settings.s3_bucket.strip(),
                access_key_id=ak,
                secret_access_key=sk,
                sse_mode=sse,
                secret_ref="db",
                is_readonly=False,
                is_default=True,
            )
        )
    else:
        session.add(
            StorageBackend(
                id=LOCAL_BACKEND_ID,
                name="primary-local",
                provider="local",
                endpoint_url=None,
                region="",
                use_path_style=False,
                default_bucket="",
                access_key_id=None,
                secret_access_key=None,
                sse_mode=None,
                secret_ref="db",
                is_readonly=False,
                is_default=True,
            )
        )
    await session.commit()


async def migrate_legacy_storage_keys_to_blobs(session: AsyncSession) -> None:
    """
    一次性：旧版 nodes.storage_key → blobs + nodes.blob_id。
    使用原生 SQL，以便在 ORM 已去掉 storage_key 列后仍能读取旧库（迁移需在 DROP 列之前执行）。
    """
    r = await session.execute(text("PRAGMA table_info(nodes)"))
    col_names = {str(row[1]) for row in r.fetchall()}
    if "storage_key" not in col_names:
        return

    q = text(
        """
        SELECT id, storage_key, size FROM nodes
        WHERE is_folder = 0
          AND storage_key IS NOT NULL
          AND TRIM(storage_key) != ''
          AND (blob_id IS NULL OR TRIM(COALESCE(blob_id, '')) = '')
        """
    )
    result = await session.execute(q)
    rows = result.fetchall()
    if not rows:
        return

    local_be = await session.get(StorageBackend, LOCAL_BACKEND_ID)
    if local_be is None:
        raise RuntimeError("缺少本地 storage_backend 种子，无法迁移旧 storage_key")

    for row in rows:
        node_id, sk, size = str(row[0]), str(row[1]), int(row[2] or 0)
        if not sk:
            continue
        blob = Blob(
            id=str(uuid.uuid4()),
            storage_backend_id=LOCAL_BACKEND_ID,
            bucket="",
            object_key=sk,
            size=size,
            etag=None,
            refcount=1,
        )
        session.add(blob)
        await session.flush()
        await session.execute(
            text("UPDATE nodes SET blob_id = :bid WHERE id = :nid"),
            {"bid": blob.id, "nid": node_id},
        )
    await session.commit()


async def reconcile_blob_references(session: AsyncSession) -> None:
    """修复旧版复制逻辑产生的重复 Blob，并让 refcount 与实际节点引用一致。"""
    blobs = list((await session.execute(select(Blob).order_by(Blob.created_at, Blob.id))).scalars())
    groups: dict[tuple[str, str, str], list[Blob]] = {}
    for blob in blobs:
        key = (blob.storage_backend_id, blob.bucket, blob.object_key)
        groups.setdefault(key, []).append(blob)

    for group in groups.values():
        ids = [blob.id for blob in group]
        refcount = int(
            await session.scalar(
                select(func.count(Node.id)).where(Node.blob_id.in_(ids))
            )
            or 0
        )
        primary = group[0]
        if len(group) > 1:
            await session.execute(
                update(Node).where(Node.blob_id.in_(ids[1:])).values(blob_id=primary.id)
            )
            for duplicate in group[1:]:
                await session.delete(duplicate)
        primary.refcount = refcount

    await session.commit()


async def drop_nodes_storage_key_column(engine: AsyncEngine) -> None:
    """迁移完成后删除 nodes.storage_key（需 SQLite 3.35+ 的 DROP COLUMN）。"""
    async with engine.begin() as conn:
        rows = await conn.execute(text("PRAGMA table_info(nodes)"))
        col_names = {str(r[1]) for r in rows.fetchall()}
        if "storage_key" not in col_names:
            return
        await conn.execute(text("ALTER TABLE nodes DROP COLUMN storage_key"))
