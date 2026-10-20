from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access_log import AccessLog
from app.models.node import Node
from app.models.user import User
from app.schemas.admin import AdminUserOut
from app.services import node_service


async def list_users(session: AsyncSession) -> list[AdminUserOut]:
    rows = await session.execute(
        select(
            User,
            func.count(Node.id).label("file_count"),
            func.coalesce(func.sum(Node.size), 0).label("storage"),
        )
        .outerjoin(Node, Node.owner_id == User.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )
    return [
        AdminUserOut(
            id=u.id,
            username=u.username,
            is_admin=u.is_admin,
            is_active=u.is_active,
            file_count=fc or 0,
            storage=st or 0,
            created_at=u.created_at,
        )
        for u, fc, st in rows.all()
    ]


async def update_user(
    session: AsyncSession,
    target_id: str,
    *,
    is_admin: bool | None = None,
    is_active: bool | None = None,
) -> AdminUserOut:
    target = await session.get(User, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")

    if is_admin is False:
        remaining = await session.scalar(
            select(func.count(User.id)).where(
                User.is_admin == True,
                User.id != target_id,
                User.is_active == True,
            )
        )
        if remaining == 0:
            raise HTTPException(
                status_code=400, detail="不能撤销最后一名活跃管理员的权限"
            )

    if is_admin is not None:
        target.is_admin = is_admin
    if is_active is not None:
        target.is_active = is_active
    await session.flush()

    fc = (await session.execute(select(func.count(Node.id)).where(Node.owner_id == target.id))).scalar() or 0
    st = (await session.execute(select(func.coalesce(func.sum(Node.size), 0)).where(Node.owner_id == target.id))).scalar() or 0

    return AdminUserOut(
        id=target.id,
        username=target.username,
        is_admin=target.is_admin,
        is_active=target.is_active,
        file_count=fc,
        storage=st,
        created_at=target.created_at,
    )


async def delete_user(session: AsyncSession, target_id: str) -> list[tuple[str, str, str]]:
    target = await session.get(User, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if target.is_admin:
        remaining = await session.scalar(
            select(func.count(User.id)).where(
                User.is_admin == True,
                User.id != target_id,
                User.is_active == True,
            )
        )
        if remaining == 0:
            raise HTTPException(
                status_code=400, detail="不能删除最后一名活跃管理员"
            )
    roots = list(
        (
            await session.execute(
                select(Node).where(
                    Node.owner_id == target_id,
                    Node.parent_id.is_(None),
                )
            )
        ).scalars().all()
    )
    purged: list[tuple[str, str, str]] = []
    for root in roots:
        purged.extend(
            await node_service.delete_cascade(
                session,
                root.id,
                target_id,
                allow_root=True,
            )
        )

    # 用户可能曾向他人的协作文件夹上传内容。这些节点不在其个人根目录下，
    # 删除账号时转交给最近的外部祖先所有者，避免 RESTRICT 失败或误删他人目录。
    remaining_nodes = list(
        (
            await session.execute(select(Node).where(Node.owner_id == target_id))
        ).scalars().all()
    )
    for node in remaining_nodes:
        parent_id = node.parent_id
        inherited_owner_id: str | None = None
        while parent_id:
            parent = await session.get(Node, parent_id)
            if not parent:
                break
            if parent.owner_id and parent.owner_id != target_id:
                inherited_owner_id = parent.owner_id
                break
            parent_id = parent.parent_id
        if not inherited_owner_id:
            raise HTTPException(status_code=409, detail="用户仍有无法转交的文件节点")
        node.owner_id = inherited_owner_id

    await session.delete(target)
    await session.flush()
    return purged
