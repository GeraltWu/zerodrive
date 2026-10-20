from functools import lru_cache
from pathlib import Path
from typing import Literal, List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    files_dir: str = "./data/files"
    database_dir: str = "./data/database"

    @property
    def database_path(self) -> str:
        """SQLite 文件名固定，存放目录由 DATABASE_DIR 配置。"""
        return str(Path(self.database_dir) / "zerodrive.db")

    # 仅当 storage_backends 为空时用于种子一行默认后端；连接与密钥以数据库为准（见 README）
    storage_driver: Literal["local", "s3"] = "local"
    s3_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket: str = "zerodrive"
    s3_use_path_style: bool = True
    """MinIO 等自建服务通常为 True；AWS 公有云一般为 False。"""

    admin_username: str = "admin"
    admin_password: str = "change-me"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    session_cookie_name: str = "zd_session"
    session_cookie_secure: bool = False
    """HTTPS 部署时设为 True；本地 HTTP 开发保持 False。"""

    cors_origins: str = "http://localhost:5173"
    public_base_url: str | None = None
    """对外可访问的站点根地址，用于生成 Bot 签名下载链接。"""

    bot_download_expire_seconds: int = 300
    """random-image 返回的 download_url 签名有效期（秒）。"""

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
