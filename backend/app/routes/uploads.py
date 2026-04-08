from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, UploadFile

from app.schemas.uploads import OcrResult, UploadRecord
from app.services.file_storage import get_upload_metadata, save_upload
from app.services.ocr_service import run_ocr


router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("", response_model=UploadRecord, status_code=201)
async def create_upload(
    file: Optional[UploadFile] = File(default=None),
) -> UploadRecord:
    return await save_upload(file)


@router.get("/{upload_id}", response_model=UploadRecord)
def read_upload(upload_id: str) -> UploadRecord:
    return get_upload_metadata(upload_id)


@router.post("/{upload_id}/ocr", response_model=OcrResult)
def extract_upload_text(upload_id: str) -> OcrResult:
    return OcrResult(text=run_ocr(upload_id))
