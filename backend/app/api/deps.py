from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User


async def get_current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        token = request.cookies.get(get_settings().session_cookie_name, "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="未登录")
    sub = decode_access_token(token)
    if not sub:
        raise HTTPException(status_code=401, detail="登录已失效")
    user = await db.get(User, sub)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已被禁用")
    return user


async def get_current_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


async def get_current_user_optional(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        token = request.cookies.get(get_settings().session_cookie_name, "").strip()
    if not token:
        return None
    sub = decode_access_token(token)
    if not sub:
        return None
    user = await db.get(User, sub)
    if user and not user.is_active:
        return None
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(get_current_admin)]
OptionalCurrentUser = Annotated[User | None, Depends(get_current_user_optional)]
