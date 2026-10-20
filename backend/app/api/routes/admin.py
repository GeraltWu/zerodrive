from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentAdmin, CurrentUser
from app.db.session import get_db
from app.schemas.admin import UpdateUserBody
from app.schemas.response import ok
from app.services import admin_service
from app.services.node_service import purge_storage_after_delete

router = APIRouter()
Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("/users", response_model=dict)
async def list_users(_admin: CurrentAdmin, db: Db) -> dict:
    items = await admin_service.list_users(db)
    return ok([i.model_dump(mode="json") for i in items]).model_dump()


@router.patch("/users/{target_id}", response_model=dict)
async def update_user(
    target_id: str,
    body: UpdateUserBody,
    _admin: CurrentAdmin,
    db: Db,
) -> dict:
    updated = await admin_service.update_user(
        db, target_id, is_admin=body.is_admin, is_active=body.is_active
    )
    return ok(updated.model_dump(mode="json")).model_dump()


@router.delete("/users/{target_id}", response_model=dict)
async def delete_user(
    target_id: str,
    _admin: CurrentAdmin,
    db: Db,
) -> dict:
    purged = await admin_service.delete_user(db, target_id)
    await db.commit()
    await purge_storage_after_delete(purged)
    return ok(None).model_dump()
