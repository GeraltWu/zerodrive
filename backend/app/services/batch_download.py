from __future__ import annotations

import os
import zipfile
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.core.config import get_settings
from app.models.node import Node
from app.models.storage import Blob, StorageBackend
from app.services import node_service
from app.services.storage_drivers import StorageDriver, get_driver


@dataclass(slots=True)
class ZipEntry:
    node_id: str
    archive_name: str
    is_directory: bool
    modified_at: datetime
    size: int = 0
    driver: StorageDriver | None = None
    bucket: str = ""
    object_key: str = ""


class ZipStreamBuffer:
    """zipfile 可写入的非 seek 缓冲区，每次写入后可立即取出字节。"""

    def __init__(self) -> None:
        self._position = 0
        self._chunks: deque[bytes] = deque()

    def write(self, data: bytes) -> int:
        chunk = bytes(data)
        if chunk:
            self._chunks.append(chunk)
            self._position += len(chunk)
        return len(chunk)

    def tell(self) -> int:
        return self._position

    def seekable(self) -> bool:
        return False

    def writable(self) -> bool:
        return True

    def flush(self) -> None:
        return None

    def drain(self) -> Iterable[bytes]:
        while self._chunks:
            yield self._chunks.popleft()


def _safe_name(name: str, fallback: str) -> str:
    cleaned = name.replace("/", "_").replace("\\", "_").replace("\0", "").strip()
    if cleaned in {"", ".", ".."}:
        return fallback
    return cleaned


def _unique_name(name: str, used: set[str], *, is_directory: bool) -> str:
    candidate = name
    suffix_number = 2
    stem, extension = os.path.splitext(name) if not is_directory else (name, "")
    while candidate.casefold() in used:
        candidate = f"{stem} ({suffix_number}){extension}"
        suffix_number += 1
    used.add(candidate.casefold())
    return candidate


def _zip_datetime(value: datetime) -> tuple[int, int, int, int, int, int]:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    value = value.astimezone(timezone.utc)
    if value.year < 1980:
        return (1980, 1, 1, 0, 0, 0)
    return (value.year, value.month, value.day, value.hour, value.minute, value.second)


async def prepare_entries(
    session: AsyncSession,
    node_ids: list[str],
    user_id: str,
    *,
    max_files: int | None = None,
) -> list[ZipEntry]:
    unique_ids = list(dict.fromkeys(node_ids))
    if not unique_ids:
        raise HTTPException(status_code=400, detail="请选择要下载的文件")

    settings = get_settings()
    driver_cache: dict[str, StorageDriver] = {}
    entries: list[ZipEntry] = []
    file_count = 0

    async def add_node(node: Node, archive_name: str) -> None:
        nonlocal file_count
        if node.is_folder:
            folder_path = archive_name.rstrip("/") + "/"
            entries.append(
                ZipEntry(
                    node_id=node.id,
                    archive_name=folder_path,
                    is_directory=True,
                    modified_at=node.updated_at,
                )
            )
            result = await session.execute(
                select(Node)
                .where(Node.parent_id == node.id)
                .order_by(Node.is_folder.desc(), Node.name.asc())
            )
            children = list(result.scalars().all())
            used_names: set[str] = set()
            for child in children:
                safe_child_name = _safe_name(
                    child.name,
                    "文件夹" if child.is_folder else "文件",
                )
                child_name = _unique_name(
                    safe_child_name,
                    used_names,
                    is_directory=child.is_folder,
                )
                await add_node(child, f"{folder_path}{child_name}")
            return

        if not node.blob_id:
            raise HTTPException(status_code=404, detail=f"文件无内容：{node.name}")
        blob = await session.get(Blob, node.blob_id)
        if not blob:
            raise HTTPException(status_code=404, detail=f"文件无内容：{node.name}")
        backend = await session.get(StorageBackend, blob.storage_backend_id)
        if not backend:
            raise HTTPException(status_code=404, detail=f"存储后端不存在：{node.name}")
        driver = driver_cache.get(backend.id)
        if driver is None:
            driver = get_driver(backend, settings)
            driver_cache[backend.id] = driver
        if driver.is_filesystem() and not driver.filesystem_path(blob.object_key).is_file():
            raise HTTPException(status_code=404, detail=f"文件无内容：{node.name}")
        entries.append(
            ZipEntry(
                node_id=node.id,
                archive_name=archive_name,
                is_directory=False,
                modified_at=node.updated_at,
                size=node.size,
                driver=driver,
                bucket=blob.bucket,
                object_key=blob.object_key,
            )
        )
        file_count += 1
        if max_files is not None:
            if file_count > max_files:
                raise HTTPException(
                    status_code=400,
                    detail=f"逐个下载一次最多包含 {max_files} 个文件",
                )

    used_root_names: set[str] = set()
    for node_id in unique_ids:
        node = await node_service.get_node(session, node_id, user_id)
        safe_root_name = _safe_name(
            node.name,
            "文件夹" if node.is_folder else "文件",
        )
        root_name = _unique_name(
            safe_root_name,
            used_root_names,
            is_directory=node.is_folder,
        )
        await add_node(node, root_name)

    return entries


async def build_download_manifest(
    session: AsyncSession,
    node_ids: list[str],
    user_id: str,
) -> list[dict[str, str | int]]:
    entries = await prepare_entries(
        session,
        node_ids,
        user_id,
        max_files=1000,
    )
    return [
        {
            "node_id": entry.node_id,
            "path": entry.archive_name,
            "size": entry.size,
        }
        for entry in entries
        if not entry.is_directory
    ]


def _stream_zip(entries: list[ZipEntry]):
    buffer = ZipStreamBuffer()
    with zipfile.ZipFile(
        buffer,
        mode="w",
        compression=zipfile.ZIP_STORED,
        allowZip64=True,
    ) as archive:
        for entry in entries:
            info = zipfile.ZipInfo(
                filename=entry.archive_name,
                date_time=_zip_datetime(entry.modified_at),
            )
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = (0o40775 if entry.is_directory else 0o100644) << 16

            if entry.is_directory:
                archive.writestr(info, b"")
                yield from buffer.drain()
                continue

            if entry.driver is None:
                continue
            source, _ = entry.driver.get_object_stream(
                entry.bucket,
                entry.object_key,
                None,
            )
            try:
                with archive.open(info, mode="w", force_zip64=True) as target:
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        target.write(chunk)
                        yield from buffer.drain()
            finally:
                close_fn = getattr(source, "close", None)
                if callable(close_fn):
                    close_fn()
            yield from buffer.drain()

    yield from buffer.drain()


async def build_batch_download_response(
    session: AsyncSession,
    node_ids: list[str],
    user_id: str,
) -> StreamingResponse:
    entries = await prepare_entries(session, node_ids, user_id)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"ZeroDrive-{timestamp}.zip"
    return StreamingResponse(
        _stream_zip(entries),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "no-store",
        },
    )
