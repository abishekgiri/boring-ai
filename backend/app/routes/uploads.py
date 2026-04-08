from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, UploadFile

from app.schemas.uploads import UploadRecord
from app.services.file_storage import get_upload_metadata, save_upload


router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("", response_model=UploadRecord, status_code=201)
async def create_upload(
    file: Optional[UploadFile] = File(default=None),
) -> UploadRecord:
    return await save_upload(file)


@router.get("/{upload_id}", response_model=UploadRecord)
def read_upload(upload_id: str) -> UploadRecord:
    return get_upload_metadata(upload_id)
