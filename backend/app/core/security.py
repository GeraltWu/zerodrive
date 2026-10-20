import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

password_hasher = PasswordHash.recommended()


def create_access_token(subject: str) -> str:
    s = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=s.jwt_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
        sub = payload.get("sub")
        if sub is None or not isinstance(sub, str):
            return None
        return sub
    except JWTError:
        return None


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    if password_hash.startswith("$argon2"):
        try:
            return password_hasher.verify(plain_password, password_hash)
        except (TypeError, ValueError):
            return False

    # Existing ZeroDrive installations used passlib's plain bcrypt hashes.
    # bcrypt historically ignored bytes after byte 72, so preserve that
    # behavior only while verifying legacy hashes.
    if password_hash.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            candidate = plain_password.encode("utf-8")[:72]
            return bcrypt.checkpw(candidate, password_hash.encode("ascii"))
        except (TypeError, ValueError, UnicodeError):
            return False

    return False


def _download_sig_payload(node_id: str, exp: int) -> bytes:
    return f"{node_id}:{exp}".encode("utf-8")


def create_download_signature(node_id: str, exp: int) -> str:
    secret = get_settings().jwt_secret.encode("utf-8")
    return hmac.new(secret, _download_sig_payload(node_id, exp), hashlib.sha256).hexdigest()


def verify_download_signature(node_id: str, exp: int, sig: str) -> bool:
    if exp < int(time.time()):
        return False
    expected = create_download_signature(node_id, exp)
    return hmac.compare_digest(expected, sig)
