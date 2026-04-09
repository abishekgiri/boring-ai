from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.db.database import get_expense_by_id, insert_expense
from app.schemas.expenses import ExpenseCreate, ExpenseRecord
from app.services.file_storage import get_upload_metadata


router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def _build_file_path(stored_filename: str) -> str:
    settings = get_settings()
    return str(Path(settings.backend_root.name) / "uploads" / "files" / stored_filename)


@router.post("", response_model=ExpenseRecord, status_code=201)
def create_expense(payload: ExpenseCreate) -> ExpenseRecord:
    upload_record = get_upload_metadata(payload.upload_id)
    if not upload_record.ocr_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="OCR text is missing. Run OCR before saving an expense.",
        )

    return insert_expense(
        payload,
        file_path=_build_file_path(upload_record.stored_filename),
        raw_ocr_text=upload_record.ocr_text,
    )


@router.get("/{expense_id}", response_model=ExpenseRecord)
def read_expense(expense_id: int) -> ExpenseRecord:
    return get_expense_by_id(expense_id)
