from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.schemas.uploads import ExtractionResult, OcrResult, UploadRecord
from app.services.ai_extraction import extract_expense_data
from app.services.file_storage import (
    get_upload_metadata,
    save_upload,
    update_upload_extracted_fields,
)
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
    text, document_classification = run_ocr(upload_id)
    return OcrResult(text=text, document_classification=document_classification)


@router.post("/{upload_id}/extract", response_model=ExtractionResult)
def extract_upload_fields(upload_id: str) -> ExtractionResult:
    record = get_upload_metadata(upload_id)
    if not record.ocr_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="OCR text is missing. Run OCR before extracting fields.",
        )

    extraction_outcome = extract_expense_data(record.ocr_text)
    updated_record = update_upload_extracted_fields(
        upload_id,
        extraction_outcome.fields,
        extraction_outcome.provenance,
        extraction_outcome.field_confidence,
    )

    return ExtractionResult(
        upload_id=updated_record.id,
        ocr_text=updated_record.ocr_text or record.ocr_text,
        extracted_fields=updated_record.extracted_fields or extraction_outcome.fields,
        document_classification=updated_record.document_classification
        or record.document_classification,
        extraction_provenance=updated_record.extraction_provenance
        or extraction_outcome.provenance,
        field_confidence=updated_record.field_confidence
        or extraction_outcome.field_confidence,
    )
