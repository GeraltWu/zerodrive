from __future__ import annotations

import pathlib

from app.core.config import get_settings


def ensure_files_dir() -> pathlib.Path:
    settings = get_settings()
    root = pathlib.Path(settings.files_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def abs_path(storage_key: str) -> pathlib.Path:
    base = ensure_files_dir()
    rel = pathlib.Path(storage_key)
    if rel.is_absolute():
        raise ValueError("storage_key must be relative")
    target = (base / rel).resolve()
    try:
        target.relative_to(base)
    except ValueError as e:
        raise ValueError("Invalid storage_key path") from e
    return target


def delete_blob(storage_key: str) -> None:
    path = abs_path(storage_key)
    if path.is_file():
        path.unlink()


def open_read_binary(storage_key: str):
    path = abs_path(storage_key)
    return open(path, "rb")


async def save_upload_from_uploadfile(storage_key: str, upload_file) -> int:
    path = abs_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with open(path, "wb") as f:
        while True:
            chunk = await upload_file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
    return total
