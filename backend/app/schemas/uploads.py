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


PaymentMethod = Literal[
    "card",
    "cash",
    "paypal",
    "bank_transfer",
    "wire_transfer",
    "check",
    "other",
]

ClassificationLevel = Literal["strong", "caution", "warning"]
DocumentType = Literal["receipt", "invoice", "unknown"]


class ExtractedLineItem(BaseModel):
    description: str
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    line_total: Optional[float] = None

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        if not value:
            raise ValueError("Line item description is required.")
        return value

    @field_validator("quantity", "unit_price", "line_total", mode="before")
    @classmethod
    def normalize_numeric_values(cls, value: object) -> object:
        if value in ("", None):
            return None
        return value


class ExtractedExpenseFields(BaseModel):
    vendor: Optional[str]
    amount: Optional[float]
    date: Optional[date]
    category: Optional[ExpenseCategory]
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    receipt_number: Optional[str] = None
    due_date: Optional[date] = None
    payment_method: Optional[PaymentMethod] = None
    line_items: list[ExtractedLineItem] = []

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

    @field_validator("subtotal", "tax_amount", mode="before")
    @classmethod
    def normalize_optional_amounts(cls, value: object) -> object:
        if value in ("", None):
            return None
        return value

    @field_validator("date", mode="before")
    @classmethod
    def normalize_date(cls, value: object) -> object:
        if value in ("", None):
            return None
        return value

    @field_validator("due_date", mode="before")
    @classmethod
    def normalize_due_date(cls, value: object) -> object:
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

    @field_validator("receipt_number", mode="before")
    @classmethod
    def normalize_receipt_number(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_payment_method(cls, value: object) -> object:
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


class DocumentClassification(BaseModel):
    document_type: DocumentType
    level: ClassificationLevel
    badge: str
    summary: str
    reason: str
    positives: list[str] = []
    warnings: list[str] = []


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
    document_classification: Optional[DocumentClassification] = None


class OcrResult(BaseModel):
    text: str
    document_classification: Optional[DocumentClassification] = None


class ExtractionResult(BaseModel):
    upload_id: str
    ocr_text: str
    extracted_fields: ExtractedExpenseFields
    document_classification: Optional[DocumentClassification] = None
