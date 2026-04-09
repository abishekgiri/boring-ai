from __future__ import annotations

from datetime import date, datetime
from typing import List

from pydantic import BaseModel, Field, field_validator

from app.schemas.uploads import ExpenseCategory


class ExpenseCreate(BaseModel):
    upload_id: str
    vendor: str
    amount: float = Field(gt=0)
    date: date
    category: ExpenseCategory

    @field_validator("upload_id", "vendor", mode="before")
    @classmethod
    def normalize_required_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        normalized = value.strip()
        return normalized

    @field_validator("upload_id")
    @classmethod
    def validate_upload_id(cls, value: str) -> str:
        if not value:
            raise ValueError("Upload ID is required.")
        return value

    @field_validator("vendor")
    @classmethod
    def validate_vendor(cls, value: str) -> str:
        if not value:
            raise ValueError("Vendor is required.")
        return value

    @field_validator("category", mode="before")
    @classmethod
    def normalize_category(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        normalized = value.strip().lower()
        return normalized


class ExpenseRecord(BaseModel):
    id: int
    upload_id: str
    file_path: str
    vendor: str
    amount: float
    date: date
    category: ExpenseCategory
    raw_ocr_text: str
    created_at: datetime


class ExpenseListResponse(BaseModel):
    items: List[ExpenseRecord]
    total: int
