from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Tuple


DEFAULT_MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
ALLOWED_UPLOAD_CONTENT_TYPES = (
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
)
ALLOWED_UPLOAD_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".pdf")


@dataclass(frozen=True)
class Settings:
    app_env: str
    cors_origins: Tuple[str, ...]
    backend_root: Path
    uploads_root: Path
    uploads_files_dir: Path
    uploads_metadata_dir: Path
    uploads_public_path: str
    max_upload_size_bytes: int


def _parse_cors_origins() -> Tuple[str, ...]:
    raw_value = os.getenv(
        "BACKEND_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return tuple(origin.strip() for origin in raw_value.split(",") if origin.strip())


def _parse_max_upload_size() -> int:
    raw_value = os.getenv("MAX_UPLOAD_SIZE_BYTES", str(DEFAULT_MAX_UPLOAD_SIZE_BYTES))
    try:
        return int(raw_value)
    except ValueError:
        return DEFAULT_MAX_UPLOAD_SIZE_BYTES


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    backend_root = Path(__file__).resolve().parents[2]
    uploads_root = backend_root / "uploads"
    uploads_files_dir = uploads_root / "files"
    uploads_metadata_dir = uploads_root / "metadata"

    uploads_files_dir.mkdir(parents=True, exist_ok=True)
    uploads_metadata_dir.mkdir(parents=True, exist_ok=True)

    return Settings(
        app_env=os.getenv("APP_ENV", "development"),
        cors_origins=_parse_cors_origins(),
        backend_root=backend_root,
        uploads_root=uploads_root,
        uploads_files_dir=uploads_files_dir,
        uploads_metadata_dir=uploads_metadata_dir,
        uploads_public_path="/uploads",
        max_upload_size_bytes=_parse_max_upload_size(),
    )
