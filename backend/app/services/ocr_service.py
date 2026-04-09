from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import pytesseract
from fastapi import HTTPException, status
from pdf2image import convert_from_path
from pdf2image.exceptions import PDFInfoNotInstalledError, PDFPageCountError
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError
from pytesseract import Output, TesseractNotFoundError

from app.schemas.uploads import DocumentClassification
from app.services.document_classification import classify_document
from app.services.file_storage import (
    get_upload_file_path,
    get_upload_metadata,
    update_upload_ocr_text,
)

TOTAL_KEYWORD_RE = re.compile(
    r"\b(receipt total|grand total|amount due|total due|balance due|subtotal|total)\b",
    re.IGNORECASE,
)
DATE_KEYWORD_RE = re.compile(
    r"\b(receipt date|invoice date|due date|issued|date)\b",
    re.IGNORECASE,
)
AMOUNT_RE = re.compile(r"\d[\d,]*\.\d{2}")
NOISE_RE = re.compile(r"[{}[\]|~_^]{2,}")


@dataclass(frozen=True)
class OCRCandidate:
    name: str
    text: str
    score: int


def _normalize_ocr_text(text: str) -> str:
    cleaned_lines: list[str] = []
    blank_streak = 0

    for raw_line in text.splitlines():
        line = " ".join(raw_line.replace("\t", " ").split())
        if not line:
            blank_streak += 1
            if blank_streak <= 1 and cleaned_lines:
                cleaned_lines.append("")
            continue

        blank_streak = 0
        cleaned_lines.append(line)

    while cleaned_lines and cleaned_lines[-1] == "":
        cleaned_lines.pop()

    normalized = "\n".join(cleaned_lines).strip()
    normalized = re.sub(r"([A-Za-z])\s{2,}([A-Za-z])", r"\1 \2", normalized)
    return normalized


def _score_ocr_text(text: str) -> int:
    normalized = _normalize_ocr_text(text)
    if not normalized:
        return 0

    non_empty_lines = [line for line in normalized.splitlines() if line.strip()]
    amount_count = len(AMOUNT_RE.findall(normalized))
    score = 0

    if len(normalized) >= 120:
        score += 3
    elif len(normalized) >= 60:
        score += 2
    elif len(normalized) >= 30:
        score += 1

    if len(non_empty_lines) >= 6:
        score += 2
    elif len(non_empty_lines) >= 3:
        score += 1

    if TOTAL_KEYWORD_RE.search(normalized):
        score += 3
    if DATE_KEYWORD_RE.search(normalized):
        score += 2
    if amount_count >= 2:
        score += 2
    elif amount_count == 1:
        score += 1

    score += min(sum(ch.isalpha() for ch in normalized) // 40, 3)
    score -= len(NOISE_RE.findall(normalized))

    return score


def _maybe_auto_rotate(image: Image.Image) -> Image.Image:
    oriented = ImageOps.exif_transpose(image)

    try:
        osd = pytesseract.image_to_osd(oriented, output_type=Output.DICT)
    except Exception:
        return oriented

    rotate_degrees = int(osd.get("rotate") or 0)
    if rotate_degrees:
        return oriented.rotate(360 - rotate_degrees, expand=True)

    return oriented


def _build_ocr_variants(image: Image.Image) -> list[tuple[str, Image.Image]]:
    base = _maybe_auto_rotate(image).convert("RGB")
    grayscale = ImageOps.grayscale(base)
    autocontrast = ImageOps.autocontrast(grayscale)
    threshold = autocontrast.point(lambda pixel: 255 if pixel > 180 else 0)
    sharpened = autocontrast.filter(ImageFilter.SHARPEN)

    return [
        ("original", base),
        ("grayscale", grayscale),
        ("autocontrast", autocontrast),
        ("threshold", threshold),
        ("sharpened", sharpened),
    ]


def _extract_best_text_from_image(image: Image.Image) -> str:
    candidates: list[OCRCandidate] = []
    seen_text: set[str] = set()

    for variant_name, variant_image in _build_ocr_variants(image):
        try:
            text = pytesseract.image_to_string(variant_image, config="--psm 6")
        finally:
            if variant_image is not image:
                variant_image.close()

        normalized_text = _normalize_ocr_text(text)
        if not normalized_text or normalized_text in seen_text:
            continue

        seen_text.add(normalized_text)
        candidates.append(
            OCRCandidate(
                name=variant_name,
                text=normalized_text,
                score=_score_ocr_text(normalized_text),
            )
        )

    if not candidates:
        return ""

    best_candidate = max(
        candidates,
        key=lambda candidate: (candidate.score, len(candidate.text)),
    )
    return best_candidate.text


def _ocr_image_file(file_path: Path) -> str:
    try:
        with Image.open(file_path) as image:
            return _extract_best_text_from_image(image)
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
        try:
            extracted_pages.append(_extract_best_text_from_image(page))
        finally:
            page.close()

    return "\n\n".join(text for text in extracted_pages if text)


def run_ocr(upload_id: str) -> tuple[str, DocumentClassification]:
    upload_record = get_upload_metadata(upload_id)
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

    normalized_text = _normalize_ocr_text(text)
    if not normalized_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="OCR completed but no readable text was found in the file.",
        )

    document_classification = classify_document(
        ocr_text=normalized_text,
        filename=upload_record.filename,
        content_type=upload_record.content_type,
    )
    update_upload_ocr_text(upload_id, normalized_text, document_classification)
    return normalized_text, document_classification
