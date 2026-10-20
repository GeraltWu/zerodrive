from __future__ import annotations

import uuid
import unittest

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
import app.models.access_log  # noqa: F401
import app.models.collaborator  # noqa: F401
import app.models.favorite  # noqa: F401
import app.models.share_link  # noqa: F401
from app.models.node import Node
from app.models.storage import Blob, StorageBackend
from app.models.user import User
from app.services.node_service import copy_node, delete_cascade
from app.services.storage_bootstrap import reconcile_blob_references
from app.services import admin_service


def uid() -> str:
    return str(uuid.uuid4())


async def make_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    return engine, factory()


async def seed_file(session):
    user = User(id=uid(), username=f"user-{uid()}", password_hash="test")
    backend = StorageBackend(
        id=uid(),
        name="test",
        provider="local",
        is_default=True,
    )
    blob = Blob(
        id=uid(),
        storage_backend_id=backend.id,
        bucket="",
        object_key=uid(),
        size=4,
        refcount=1,
    )
    root = Node(id=uid(), parent_id=None, name="", is_folder=True, owner_id=user.id)
    source = Node(
        id=uid(),
        parent_id=root.id,
        name="demo.txt",
        is_folder=False,
        size=4,
        blob_id=blob.id,
        owner_id=user.id,
    )
    session.add_all([user, backend, blob, root, source])
    await session.commit()
    return user, backend, blob, root, source


class BlobReferenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_admin_delete_removes_owned_tree_and_returns_physical_objects(self):
        engine, session = await make_session()
        try:
            user, backend, blob, root, source = await seed_file(session)

            purged = await admin_service.delete_user(session, user.id)
            await session.commit()

            self.assertIsNone(await session.get(User, user.id))
            self.assertIsNone(await session.get(Node, root.id))
            self.assertIsNone(await session.get(Node, source.id))
            self.assertIsNone(await session.get(Blob, blob.id))
            self.assertEqual(purged, [(backend.id, blob.bucket, blob.object_key)])
        finally:
            await session.close()
            await engine.dispose()

    async def test_admin_delete_transfers_uploads_inside_another_users_shared_tree(self):
        engine, session = await make_session()
        try:
            user, _backend, _blob, _root, _source = await seed_file(session)
            other = User(id=uid(), username=f"other-{uid()}", password_hash="test")
            other_root = Node(
                id=uid(), parent_id=None, name="", is_folder=True, owner_id=other.id
            )
            shared_upload = Node(
                id=uid(),
                parent_id=other_root.id,
                name="shared-upload.txt",
                is_folder=False,
                size=0,
                owner_id=user.id,
            )
            session.add_all([other, other_root, shared_upload])
            await session.commit()

            await admin_service.delete_user(session, user.id)
            await session.commit()

            transferred = await session.get(Node, shared_upload.id)
            self.assertIsNotNone(transferred)
            self.assertEqual(transferred.owner_id, other.id)
            self.assertIsNone(await session.get(User, user.id))
        finally:
            await session.close()
            await engine.dispose()

    async def test_copy_reuses_blob_and_deleting_copy_keeps_original_content(self):
        engine, session = await make_session()
        try:
            user, _backend, blob, root, source = await seed_file(session)

            copied = await copy_node(session, source.id, root.id, user.id)
            await session.commit()

            copied_node = await session.get(Node, copied.id)
            stored_blob = await session.get(Blob, blob.id)
            self.assertIsNotNone(copied_node)
            self.assertEqual(copied_node.blob_id, source.blob_id)
            self.assertIsNotNone(stored_blob)
            self.assertEqual(stored_blob.refcount, 2)

            purged = await delete_cascade(session, copied.id, user.id)
            await session.commit()

            original = await session.get(Node, source.id)
            stored_blob = await session.get(Blob, blob.id)
            self.assertEqual(purged, [])
            self.assertIsNotNone(original)
            self.assertIsNotNone(stored_blob)
            self.assertEqual(stored_blob.refcount, 1)
        finally:
            await session.close()
            await engine.dispose()

    async def test_reconcile_merges_legacy_duplicate_blob_rows(self):
        engine, session = await make_session()
        try:
            user, backend, blob, root, source = await seed_file(session)
            duplicate = Blob(
                id=uid(),
                storage_backend_id=backend.id,
                bucket=blob.bucket,
                object_key=blob.object_key,
                size=blob.size,
                refcount=1,
            )
            copied = Node(
                id=uid(),
                parent_id=root.id,
                name="legacy-copy.txt",
                is_folder=False,
                size=4,
                blob_id=duplicate.id,
                owner_id=user.id,
            )
            session.add_all([duplicate, copied])
            await session.commit()

            await reconcile_blob_references(session)

            await session.refresh(source)
            await session.refresh(copied)
            merged = await session.get(Blob, source.blob_id)
            count = await session.scalar(select(func.count()).select_from(Blob))
            self.assertEqual(copied.blob_id, source.blob_id)
            self.assertIsNotNone(merged)
            self.assertEqual(merged.refcount, 2)
            self.assertEqual(count, 1)
        finally:
            await session.close()
            await engine.dispose()


if __name__ == "__main__":
    unittest.main()
