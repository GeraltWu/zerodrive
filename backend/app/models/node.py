from __future__ import annotations

import uuid
from datetime import datetime, timezone
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

ROOT_FOLDER_ID = "00000000-0000-4000-8000-000000000001"


class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    parent_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    is_folder: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blob_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("blobs.id", ondelete="RESTRICT"),
        nullable=True,
    )
    blob: Mapped["Blob | None"] = relationship("Blob", foreign_keys=[blob_id])
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    direct_download_token: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    owner_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
