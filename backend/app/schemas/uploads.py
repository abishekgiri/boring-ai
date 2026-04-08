from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UploadRecord(BaseModel):
    id: str
    filename: str
    stored_filename: str
    content_type: str
    size: int
    file_url: str
    created_at: datetime
    ocr_text: Optional[str] = None


class OcrResult(BaseModel):
    text: str
