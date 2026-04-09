from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple


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
    repo_root: Path
    backend_root: Path
    data_root: Path
    uploads_root: Path
    uploads_files_dir: Path
    uploads_metadata_dir: Path
    uploads_public_path: str
    max_upload_size_bytes: int
    sqlite_db_path: Path
    openai_api_key: Optional[str]
    openai_model: str
    openai_api_base_url: str
    openai_timeout_seconds: float


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


def _parse_timeout_seconds() -> float:
    raw_value = os.getenv("OPENAI_TIMEOUT_SECONDS", "30")
    try:
        return float(raw_value)
    except ValueError:
        return 30.0


def _parse_sqlite_db_path(repo_root: Path) -> Path:
    raw_value = os.getenv("SQLITE_DATABASE_PATH", "backend/data/boring-ai.db").strip()
    candidate_path = Path(raw_value)
    if not candidate_path.is_absolute():
        candidate_path = repo_root / candidate_path
    return candidate_path


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    backend_root = Path(__file__).resolve().parents[2]
    repo_root = backend_root.parent
    data_root = backend_root / "data"
    uploads_root = backend_root / "uploads"
    uploads_files_dir = uploads_root / "files"
    uploads_metadata_dir = uploads_root / "metadata"
    sqlite_db_path = _parse_sqlite_db_path(repo_root)

    data_root.mkdir(parents=True, exist_ok=True)
    uploads_files_dir.mkdir(parents=True, exist_ok=True)
    uploads_metadata_dir.mkdir(parents=True, exist_ok=True)
    sqlite_db_path.parent.mkdir(parents=True, exist_ok=True)

    return Settings(
        app_env=os.getenv("APP_ENV", "development"),
        cors_origins=_parse_cors_origins(),
        repo_root=repo_root,
        backend_root=backend_root,
        data_root=data_root,
        uploads_root=uploads_root,
        uploads_files_dir=uploads_files_dir,
        uploads_metadata_dir=uploads_metadata_dir,
        uploads_public_path="/uploads",
        max_upload_size_bytes=_parse_max_upload_size(),
        sqlite_db_path=sqlite_db_path,
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        openai_api_base_url=os.getenv(
            "OPENAI_API_BASE_URL",
            "https://api.openai.com/v1",
        ).rstrip("/"),
        openai_timeout_seconds=_parse_timeout_seconds(),
    )
