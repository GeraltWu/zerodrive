from __future__ import annotations

import pathlib
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import access_logs, admin, auth, bot, collaborators, favorites, nodes, shares
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine
import app.models.storage  # noqa: F401 — 注册 Blob / StorageBackend 到 metadata
import app.models.collaborator  # noqa: F401 — 注册 FolderCollaborator 到 metadata
import app.models.favorite  # noqa: F401 — 注册 Favorite 到 metadata
import app.models.share_link  # noqa: F401 — 注册 ShareLink 到 metadata
import app.models.access_log  # noqa: F401 — 注册 AccessLog 到 metadata
from app.schemas.response import err, ok
from app.services.bot_path import PathNotFoundError, PathValidationError
from app.services.bot_service import NoFilesError
from app.services.node_service import (
    ConflictError,
    NodeNotFoundError,
    NodeValidationError,
)
from app.services.storage import ensure_files_dir


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_dotenv()
    settings = get_settings()
    pathlib.Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
    ensure_files_dir()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migration: add is_active column if upgrading from v1
        for col, col_def in [
            ("is_admin", "BOOLEAN NOT NULL DEFAULT 0"),
            ("is_active", "BOOLEAN NOT NULL DEFAULT 1"),
        ]:
            try:
                await conn.run_sync(
                    lambda sync_conn, c=col, d=col_def: sync_conn.exec_driver_sql(
                        f"ALTER TABLE users ADD COLUMN {c} {d}"
                    )
                )
            except Exception:
                pass
        try:
            await conn.run_sync(
                lambda sync_conn: sync_conn.exec_driver_sql(
                    "ALTER TABLE nodes ADD COLUMN direct_download_token VARCHAR(64)"
                )
            )
        except Exception:
            pass
    yield
    await engine.dispose()


app = FastAPI(title="ZeroDrive API", lifespan=lifespan)

# Increase upload limits from Starlette defaults (1 MB)
from starlette.formparsers import MultiPartParser
MultiPartParser.max_part_size = 1024 * 1024 * 1024  # 1 GB per part
MultiPartParser.spool_max_size = 10 * 1024 * 1024  # 10 MB in-memory
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=err(exc.status_code, str(exc.detail)).model_dump(mode="json"),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_, exc: RequestValidationError):
    errors = [{"loc": list(x.get("loc", ())), "msg": x.get("msg", "")} for x in exc.errors()]
    return JSONResponse(
        status_code=422,
        content=err(422, "参数校验失败", data=errors).model_dump(mode="json"),
    )


@app.exception_handler(NodeNotFoundError)
async def node_not_found_handler(_, exc: NodeNotFoundError):
    return JSONResponse(
        status_code=404,
        content=err(40404, "节点不存在").model_dump(mode="json"),
    )


@app.exception_handler(ConflictError)
async def conflict_handler(_, exc: ConflictError):
    return JSONResponse(
        status_code=409,
        content=err(40901, str(exc) or "资源冲突").model_dump(mode="json"),
    )


@app.exception_handler(NodeValidationError)
async def node_validation_handler(_, exc: NodeValidationError):
    return JSONResponse(
        status_code=400,
        content=err(40001, str(exc)).model_dump(mode="json"),
    )


@app.exception_handler(PathValidationError)
async def path_validation_handler(_, exc: PathValidationError):
    return JSONResponse(
        status_code=400,
        content=err(40002, str(exc)).model_dump(mode="json"),
    )


@app.exception_handler(PathNotFoundError)
async def path_not_found_handler(_, exc: PathNotFoundError):
    prefix = exc.resolved_prefix or "根"
    msg = f"路径不存在：{prefix}/{exc.segment}" if prefix != "根" else f"路径不存在：{exc.segment}"
    return JSONResponse(
        status_code=404,
        content=err(40402, msg).model_dump(mode="json"),
    )


@app.exception_handler(NoFilesError)
async def no_files_handler(_, _exc: NoFilesError):
    return JSONResponse(
        status_code=404,
        content=err(40403, "该文件夹内没有符合条件的文件").model_dump(mode="json"),
    )


@app.get("/api/health")
async def health():
    return JSONResponse(content=ok({"status": "ok"}).model_dump(mode="json"))


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(bot.router, prefix="/api/bot", tags=["bot"])
app.include_router(nodes.router, prefix="/api/nodes", tags=["nodes"])
app.include_router(collaborators.router, prefix="/api/collaborators", tags=["collaborators"])
app.include_router(favorites.router, prefix="/api/favorites", tags=["favorites"])
app.include_router(shares.router, prefix="/api/share-links", tags=["share-links"])
app.include_router(shares.public_router, prefix="/api/public/share", tags=["public"])
app.include_router(access_logs.router, prefix="/api/access-logs", tags=["access-logs"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
