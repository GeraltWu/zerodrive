from __future__ import annotations

import asyncio
import io
import os
import shutil
import sys
import uuid
import zipfile
from pathlib import Path
from urllib.parse import urlsplit


def main() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend_root))
    root = backend_root / ".test-data" / f"http-{uuid.uuid4().hex}"
    root.mkdir(parents=True)
    try:
        os.environ.update(
            {
                "FILES_DIR": str(root / "files"),
                "DATABASE_DIR": str(root / "database"),
                "ADMIN_USERNAME": "integration-admin",
                "ADMIN_PASSWORD": "integration-password",
                "JWT_SECRET": "integration-only-long-random-secret",
                "JWT_EXPIRE_MINUTES": "60",
                "SESSION_COOKIE_SECURE": "false",
                "BOT_DOWNLOAD_EXPIRE_SECONDS": "300",
            }
        )

        from fastapi.testclient import TestClient

        from scripts.migrate import migrate

        asyncio.run(migrate())

        from app.main import app

        with TestClient(app) as client:
            login = client.post(
                "/api/auth/login",
                json={"username": "integration-admin", "password": "integration-password"},
            )
            assert login.status_code == 200, login.text
            assert client.cookies.get("zd_session")
            bearer = login.json()["data"]["access_token"]
            me = client.get("/api/auth/me")
            assert me.status_code == 200 and me.json()["data"]["is_admin"] is True
            assert client.get("/api/admin/users").status_code == 200

            root_id = client.get("/api/nodes/root").json()["data"]["id"]
            upload = client.post(
                "/api/nodes/upload",
                data={"parent_id": root_id},
                files={"file": ("payload.txt", b"hello", "text/plain")},
            )
            assert upload.status_code == 200, upload.text
            node_id = upload.json()["data"]["id"]

            folder = client.post(
                "/api/nodes/folder",
                json={"parent_id": root_id, "name": "bundle"},
            )
            assert folder.status_code == 200, folder.text
            folder_id = folder.json()["data"]["id"]
            nested_upload = client.post(
                "/api/nodes/upload",
                data={"parent_id": folder_id},
                files={"file": ("nested.txt", b"nested", "text/plain")},
            )
            assert nested_upload.status_code == 200, nested_upload.text

            authenticated_download = client.get(f"/api/nodes/{node_id}/download")
            assert authenticated_download.status_code == 200
            assert authenticated_download.content == b"hello"

            with TestClient(app) as anonymous:
                protected_download = anonymous.get(f"/api/nodes/{node_id}/download")
                assert protected_download.status_code == 401

                direct_link = client.put(f"/api/nodes/{node_id}/direct-download")
                assert direct_link.status_code == 200, direct_link.text
                direct_url = direct_link.json()["data"]["url"]
                repeated_direct_link = client.put(f"/api/nodes/{node_id}/direct-download")
                assert repeated_direct_link.json()["data"]["url"] == direct_url
                anonymous_direct_download = anonymous.get(direct_url)
                assert anonymous_direct_download.status_code == 200
                assert anonymous_direct_download.content == b"hello"
                invalid_direct_download = anonymous.get(
                    f"/api/nodes/{node_id}/download?key=invalid"
                )
                assert invalid_direct_download.status_code == 404

                anonymous_batch = anonymous.get(
                    "/api/nodes/batch-download",
                    params=[("ids", node_id)],
                )
                assert anonymous_batch.status_code == 401
                anonymous_manifest = anonymous.get(
                    "/api/nodes/download-manifest",
                    params=[("ids", node_id)],
                )
                assert anonymous_manifest.status_code == 401

                manifest = client.get(
                    "/api/nodes/download-manifest",
                    params=[("ids", node_id), ("ids", folder_id)],
                )
                assert manifest.status_code == 200, manifest.text
                assert manifest.json()["data"] == [
                    {"node_id": node_id, "path": "payload.txt", "size": 5},
                    {
                        "node_id": nested_upload.json()["data"]["id"],
                        "path": "bundle/nested.txt",
                        "size": 6,
                    },
                ]

                batch = client.get(
                    "/api/nodes/batch-download",
                    params=[("ids", node_id), ("ids", folder_id)],
                )
                assert batch.status_code == 200, batch.text
                assert batch.headers["content-type"].startswith("application/zip")
                with zipfile.ZipFile(io.BytesIO(batch.content)) as archive:
                    assert archive.read("payload.txt") == b"hello"
                    assert archive.read("bundle/nested.txt") == b"nested"

                share = client.post(f"/api/share-links/{node_id}", json={})
                assert share.status_code == 200, share.text
                token = share.json()["data"]["token"]
                share_download = anonymous.get(f"/api/public/share/{token}/download")
                assert share_download.status_code == 200
                assert share_download.content == b"hello"

                random_file = anonymous.get(
                    "/api/bot/random-file",
                    params={"path": "/payload.txt", "mime_prefix": "text/"},
                    headers={"Authorization": f"Bearer {bearer}"},
                )
                assert random_file.status_code == 200, random_file.text
                signed_url = random_file.json()["data"]["download_url"]
                signed = urlsplit(signed_url)
                signed_download = anonymous.get(f"{signed.path}?{signed.query}")
                assert signed_download.status_code == 200
                assert signed_download.content == b"hello"

        print("HTTP flow OK: auth, anonymous direct link, batch ZIP, share, and Bot URL")
    finally:
        shutil.rmtree(root, ignore_errors=True)
        try:
            root.parent.rmdir()
        except OSError:
            pass


if __name__ == "__main__":
    main()
