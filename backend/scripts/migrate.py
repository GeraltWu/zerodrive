"""
一次性数据库迁移脚本。仅在 schema 变更后运行一次即可。

用法:
    cd backend
    python scripts/migrate.py

幂等安全：多次运行不会重复操作。
"""
from __future__ import annotations

import asyncio
import os
import sys

_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _parent)

from dotenv import load_dotenv

load_dotenv(os.path.join(_parent, ".env"))

from sqlalchemy import select, text
from app.db.base import Base
from app.db.session import AsyncSessionLocal, engine
import app.models.collaborator  # noqa: F401 — 注册 FolderCollaborator 到 metadata
from app.models.node import ROOT_FOLDER_ID, Node
from app.models.user import User
from app.core.config import get_settings
from app.core.security import hash_password
from app.services.node_service import create_user_root
from app.services.storage import ensure_files_dir
from app.services.storage_bootstrap import (
    drop_nodes_storage_key_column,
    ensure_node_blob_id_column,
    ensure_storage_backend_columns,
    migrate_legacy_storage_keys_to_blobs,
    reconcile_blob_references,
    seed_storage_backends_if_empty,
)


async def _add_node_columns() -> None:
    """补齐 nodes 表缺失的列"""
    async with engine.begin() as conn:
        rows = await conn.execute(text("PRAGMA table_info(nodes)"))
        col_names = {str(r[1]) for r in rows.fetchall()}
        adds = [
            ("mime_type", "VARCHAR(255)"),
            ("meta_json", "JSON"),
            ("direct_download_token", "VARCHAR(64)"),
            ("owner_id", "VARCHAR(36) REFERENCES users(id)"),
        ]
        for col, dtype in adds:
            if col not in col_names:
                await conn.execute(text(f"ALTER TABLE nodes ADD COLUMN {col} {dtype}"))
                print(f"  + 已添加列 nodes.{col}")


async def migrate() -> None:
    settings = get_settings()
    ensure_files_dir()
    os.makedirs(os.path.dirname(settings.database_path), exist_ok=True)

    # 1. 建表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("1. 表结构已就绪")

    # 2. 补齐列
    await _add_node_columns()
    await ensure_node_blob_id_column(engine)
    await ensure_storage_backend_columns(engine)
    print("2. 列补齐完成")

    # 3. 种子存储后端 + 迁移 storage_key → blobs
    async with AsyncSessionLocal() as session:
        await seed_storage_backends_if_empty(session, settings)
        await migrate_legacy_storage_keys_to_blobs(session)
        await reconcile_blob_references(session)
    await drop_nodes_storage_key_column(engine)
    print("3. 存储迁移完成")

    # 4. 用户与根节点
    async with AsyncSessionLocal() as session:
        admin = (
            await session.execute(
                select(User).where(User.username == settings.admin_username)
            )
        ).scalar_one_or_none()
        if admin is None:
            admin = User(
                username=settings.admin_username,
                password_hash=hash_password(settings.admin_password),
                is_admin=True,
            )
            session.add(admin)
            await session.commit()
            print(f"  + 已创建管理员 {settings.admin_username}")
        elif not admin.is_admin:
            admin.is_admin = True
            await session.flush()
            print(f"  + 已恢复管理员权限 {settings.admin_username}")

        # 迁移旧共享根 → 个人根
        old_root = await session.get(Node, ROOT_FOLDER_ID)
        if old_root is not None:
            new_root = await create_user_root(session, admin.id)
            await session.execute(
                text(
                    "UPDATE nodes SET parent_id = :new "
                    "WHERE parent_id = :old AND owner_id = :uid"
                ),
                {"new": new_root.id, "old": ROOT_FOLDER_ID, "uid": admin.id},
            )
            await session.execute(
                text(
                    "UPDATE nodes SET owner_id = :uid "
                    "WHERE owner_id IS NULL AND id != :new_root"
                ),
                {"uid": admin.id, "new_root": new_root.id},
            )
            await session.delete(old_root)
            await session.commit()
            print("  + 旧共享根已迁移为个人根")

        # 确保 admin 有个人根
        admin_root = await session.execute(
            select(Node).where(
                Node.parent_id.is_(None), Node.owner_id == admin.id
            )
        )
        if admin_root.scalar_one_or_none() is None:
            await create_user_root(session, admin.id)
            print("  + 已创建管理员个人根")

        # 回填遗留 owner_id
        result = await session.execute(
            text("UPDATE nodes SET owner_id = :uid WHERE owner_id IS NULL"),
            {"uid": admin.id},
        )
        if result.rowcount:
            print(f"  + 已回填 {result.rowcount} 个节点的 owner_id")
        await session.commit()

    print("4. 用户与根节点就绪")
    print("\n迁移完成。")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
