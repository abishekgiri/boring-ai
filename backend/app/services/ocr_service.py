from __future__ import annotations

from pathlib import Path

import pytesseract
from fastapi import HTTPException, status
from pdf2image import convert_from_path
from pdf2image.exceptions import PDFInfoNotInstalledError, PDFPageCountError
from PIL import Image, UnidentifiedImageError
from pytesseract import TesseractNotFoundError

from app.services.file_storage import get_upload_file_path, update_upload_ocr_text


def _ocr_image_file(file_path: Path) -> str:
    try:
        with Image.open(file_path) as image:
            return pytesseract.image_to_string(image)
    except UnidentifiedImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to read the uploaded image for OCR.",
        ) from exc


def _ocr_pdf_file(file_path: Path) -> str:
    try:
        pages = convert_from_path(file_path)
    except (PDFInfoNotInstalledError, PDFPageCountError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF OCR tools are not available on this machine.",
        ) from exc
    except Exception as exc:  # pragma: no cover - safety net for OCR toolchain issues
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to process the uploaded PDF for OCR.",
        ) from exc

    extracted_pages: list[str] = []
    for page in pages:
        extracted_pages.append(pytesseract.image_to_string(page))
        page.close()

    return "\n\n".join(text.strip() for text in extracted_pages if text.strip())


def run_ocr(upload_id: str) -> str:
    file_path = get_upload_file_path(upload_id)

    try:
        if file_path.suffix.lower() == ".pdf":
            text = _ocr_pdf_file(file_path)
        else:
            text = _ocr_image_file(file_path)
    except TesseractNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Tesseract is not installed on this machine.",
        ) from exc

    normalized_text = text.strip()
    if not normalized_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="OCR completed but no readable text was found in the file.",
        )

    update_upload_ocr_text(upload_id, normalized_text)
    return normalized_text
