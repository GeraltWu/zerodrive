from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.security import create_access_token, decode_access_token
from app.db.session import AsyncSessionLocal, get_db
from app.models.node import Node
from app.schemas.share_link import (
    CreateShareLinkBody,
    VerifyPasswordBody,
)
from app.schemas.response import ok
from app.services import share_link_service

router = APIRouter()
public_router = APIRouter()
Db = Annotated[AsyncSession, Depends(get_db)]


# ── Protected routes ──────────────────────────────────────────────


@router.get("", response_model=dict)
async def list_all_shares(user: CurrentUser, db: Db) -> dict:
    items = await share_link_service.list_all_share_links(db, user.id)
    return ok([i.model_dump(mode="json") for i in items]).model_dump()


@router.post("/{node_id}", response_model=dict)
async def create_share(
    node_id: str,
    body: CreateShareLinkBody,
    user: CurrentUser,
    db: Db,
) -> dict:
    result = await share_link_service.create_share_link(
        db,
        node_id,
        user.id,
        password=body.password,
        expire_in_hours=body.expire_in_hours,
        max_access_count=body.max_access_count,
    )
    return ok(result.model_dump(mode="json")).model_dump()


@router.get("/{node_id}", response_model=dict)
async def list_shares(node_id: str, user: CurrentUser, db: Db) -> dict:
    items = await share_link_service.list_share_links(db, node_id, user.id)
    return ok([i.model_dump(mode="json") for i in items]).model_dump()


@router.delete("/{link_id}", response_model=dict)
async def revoke_share(link_id: str, user: CurrentUser, db: Db) -> dict:
    await share_link_service.revoke_share_link(db, link_id, user.id)
    return ok(None).model_dump()


@router.patch("/{link_id}/toggle", response_model=dict)
async def toggle_share(link_id: str, user: CurrentUser, db: Db) -> dict:
    result = await share_link_service.toggle_share_link(db, link_id, user.id)
    return ok(result.model_dump(mode="json")).model_dump()


@router.post("/join/{token}", response_model=dict)
async def join_share(
    token: str,
    user: CurrentUser,
    db: Db,
    share_token: Annotated[str | None, Query()] = None,
) -> dict:
    link = await share_link_service.get_share_by_token(db, token)
    if link.password_hash:
        if not share_token:
            raise HTTPException(status_code=403, detail="需要密码验证")
        sub = decode_access_token(share_token)
        if not sub or sub != f"share:{link.id}":
            raise HTTPException(status_code=403, detail="访问令牌无效或已过期")
    node_id = await share_link_service.join_folder_link(db, token, user.id)

    from app.services.access_log_service import record as record_access

    await record_access(
        db,
        node_id,
        link.owner_id,
        action="join",
        visitor_id=user.id,
        share_link_id=link.id,
    )
    return ok({"node_id": node_id}).model_dump()


# ── Public routes ─────────────────────────────────────────────────


@public_router.get("/{token}", response_model=dict)
async def public_share_info(token: str) -> dict:
    async with AsyncSessionLocal() as session:
        info = await share_link_service.get_share_node_info(session, token)
        return ok(info.model_dump(mode="json")).model_dump()


@public_router.post("/{token}/verify", response_model=dict)
async def public_verify_password(token: str, body: VerifyPasswordBody) -> dict:
    async with AsyncSessionLocal() as session:
        await share_link_service.verify_share_password(session, token, body.password)
        link = await share_link_service.get_share_by_token(session, token)
        access_token = create_access_token(f"share:{link.id}")
        return ok({"valid": True, "access_token": access_token}).model_dump()


@public_router.get("/{token}/download")
async def public_download(
    token: str,
    request: Request,
    share_token: Annotated[str | None, Query()] = None,
):
    async with AsyncSessionLocal() as session:
        link = await share_link_service.get_share_by_token(session, token)

        if link.password_hash:
            if not share_token:
                raise HTTPException(status_code=403, detail="需要密码验证")
            sub = decode_access_token(share_token)
            if not sub or sub != f"share:{link.id}":
                raise HTTPException(status_code=403, detail="访问令牌无效或已过期")

        node = await session.get(Node, link.node_id)
        if not node:
            raise HTTPException(status_code=404, detail="文件不存在")
        if node.is_folder:
            raise HTTPException(status_code=400, detail="不支持下载文件夹")

        await share_link_service.increment_access_count(session, link)

        from app.services.access_log_service import record as record_access

        await record_access(
            session,
            node.id,
            link.owner_id,
            action="download",
            share_link_id=link.id,
            size=node.size,
        )

        await session.commit()

        from app.services.node_download import build_node_download_response

        return await build_node_download_response(session, node.id, request)


@public_router.get("/{token}/thumbnail")
async def public_thumbnail(
    token: str,
    size: int = 200,
    share_token: Annotated[str | None, Query()] = None,
):
    import asyncio

    from starlette.responses import Response

    from app.core.config import get_settings
    from app.models.storage import Blob
    from app.models.storage import StorageBackend
    from app.services.storage_drivers import get_driver
    from app.services.thumbnail import thumbnail_from_bytes, thumbnail_from_path

    size = max(40, min(800, size))

    async with AsyncSessionLocal() as session:
        link = await share_link_service.get_share_by_token(session, token)

        if link.password_hash:
            if not share_token:
                raise HTTPException(status_code=403, detail="需要密码验证")
            sub = decode_access_token(share_token)
            if not sub or sub != f"share:{link.id}":
                raise HTTPException(status_code=403, detail="访问令牌无效或已过期")

        node = await session.get(Node, link.node_id)
        if not node or node.is_folder or not node.blob_id:
            raise HTTPException(status_code=404, detail="无法生成缩略图")

        blob = await session.get(Blob, node.blob_id)
        if not blob:
            raise HTTPException(status_code=404, detail="无法生成缩略图")

        backend = await session.get(StorageBackend, blob.storage_backend_id)
        if not backend:
            raise HTTPException(status_code=404, detail="无法生成缩略图")

        settings = get_settings()
        driver = get_driver(backend, settings)

        try:
            if driver.is_filesystem():
                path = driver.filesystem_path(blob.object_key)
                thumb_bytes = await thumbnail_from_path(path, size)
            else:
                body_stream, _ = await asyncio.to_thread(
                    driver.get_object_stream, blob.bucket, blob.object_key, None
                )
                try:
                    data = await asyncio.to_thread(body_stream.read)
                finally:
                    close_fn = getattr(body_stream, "close", None)
                    if callable(close_fn):
                        await asyncio.to_thread(close_fn)
                thumb_bytes = await thumbnail_from_bytes(data, size)
        except Exception:
            raise HTTPException(status_code=415, detail="不支持生成该文件的缩略图")

    return Response(content=thumb_bytes, media_type="image/jpeg")
