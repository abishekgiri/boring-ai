from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ValidationError, field_validator


ExpenseCategory = Literal[
    "meals",
    "travel",
    "software",
    "office",
    "shopping",
    "transport",
    "lodging",
    "utilities",
    "other",
]


class ExtractedExpenseFields(BaseModel):
    vendor: Optional[str]
    amount: Optional[float]
    date: Optional[date]
    category: Optional[ExpenseCategory]

    @field_validator("vendor", mode="before")
    @classmethod
    def normalize_vendor(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @field_validator("amount", mode="before")
    @classmethod
    def normalize_amount(cls, value: object) -> object:
        if value in ("", None):
            return None
        return value

    @field_validator("date", mode="before")
    @classmethod
    def normalize_date(cls, value: object) -> object:
        if value in ("", None):
            return None
        return value

    @field_validator("category", mode="before")
    @classmethod
    def normalize_category(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip().lower()
            return normalized or None
        return value

    @classmethod
    def validate_llm_output(cls, payload: object) -> "ExtractedExpenseFields":
        try:
            return cls.model_validate(payload)
        except ValidationError as exc:
            raise ValueError("LLM output did not match the expected extraction schema.") from exc


class UploadRecord(BaseModel):
    id: str
    filename: str
    stored_filename: str
    content_type: str
    size: int
    file_url: str
    created_at: datetime
    ocr_text: Optional[str] = None
    extracted_fields: Optional[ExtractedExpenseFields] = None


class OcrResult(BaseModel):
    text: str


class ExtractionResult(BaseModel):
    upload_id: str
    ocr_text: str
    extracted_fields: ExtractedExpenseFields
