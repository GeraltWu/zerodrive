from __future__ import annotations

import asyncio
import os
import shutil
import sys
import uuid
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

            authenticated_download = client.get(f"/api/nodes/{node_id}/download")
            assert authenticated_download.status_code == 200
            assert authenticated_download.content == b"hello"

            with TestClient(app) as anonymous:
                protected_download = anonymous.get(f"/api/nodes/{node_id}/download")
                assert protected_download.status_code == 401

                share = client.post(f"/api/share-links/{node_id}", json={})
                assert share.status_code == 200, share.text
                token = share.json()["data"]["token"]
                direct_download = anonymous.get(f"/api/public/share/{token}/download")
                assert direct_download.status_code == 200
                assert direct_download.content == b"hello"

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

        print("HTTP flow OK: cookie auth, public direct link, and Bot signed URL")
    finally:
        shutil.rmtree(root, ignore_errors=True)
        try:
            root.parent.rmdir()
        except OSError:
            pass


if __name__ == "__main__":
    main()
