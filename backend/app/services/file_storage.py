from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import (
    ALLOWED_UPLOAD_CONTENT_TYPES,
    ALLOWED_UPLOAD_EXTENSIONS,
    get_settings,
)
from app.schemas.uploads import UploadRecord


def _normalize_filename(filename: Optional[str]) -> str:
    if not filename:
        return ""

    return Path(filename).name.strip()


def _metadata_path(upload_id: str) -> Path:
    settings = get_settings()
    return settings.uploads_metadata_dir / f"{upload_id}.json"


def _validate_upload(file: Optional[UploadFile]) -> None:
    settings = get_settings()

    if file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing file upload.",
        )

    filename = _normalize_filename(file.filename)
    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing file name.",
        )

    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Upload PNG, JPG, JPEG, WEBP, or PDF.",
        )

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_UPLOAD_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Upload PNG, JPG, JPEG, WEBP, or PDF.",
        )

    if settings.max_upload_size_bytes <= 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upload size configuration is invalid.",
        )


async def save_upload(file: Optional[UploadFile]) -> UploadRecord:
    settings = get_settings()
    _validate_upload(file)
    assert file is not None

    original_filename = _normalize_filename(file.filename)
    suffix = Path(original_filename).suffix.lower()
    content_type = (file.content_type or "application/octet-stream").lower()

    file_bytes = await file.read()
    file_size = len(file_bytes)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if file_size > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum upload size is 10 MB.",
        )

    upload_id = str(uuid4())
    stored_filename = f"{upload_id}{suffix}"
    stored_file_path = settings.uploads_files_dir / stored_filename

    stored_file_path.write_bytes(file_bytes)

    record = UploadRecord(
        id=upload_id,
        filename=original_filename,
        stored_filename=stored_filename,
        content_type=content_type,
        size=file_size,
        file_url=f"{settings.uploads_public_path}/{stored_filename}",
        created_at=datetime.now(timezone.utc),
    )

    _metadata_path(upload_id).write_text(
        record.model_dump_json(indent=2),
        encoding="utf-8",
    )

    await file.close()
    return record


def get_upload_metadata(upload_id: str) -> UploadRecord:
    metadata_path = _metadata_path(upload_id)
    if not metadata_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found.",
        )

    payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    record = UploadRecord.model_validate(payload)

    stored_file_path = get_settings().uploads_files_dir / record.stored_filename
    if not stored_file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Uploaded file is missing from local storage.",
        )

    return record
