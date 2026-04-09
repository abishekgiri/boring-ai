from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.uploads import ExpenseCategory


class ExpenseFieldsBase(BaseModel):
    vendor: str
    amount: float = Field(gt=0)
    date: date
    category: ExpenseCategory

    @field_validator("vendor", mode="before")
    @classmethod
    def normalize_vendor(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        return value.strip()

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


class ExpenseUpdate(ExpenseFieldsBase):
    learning_context: Optional["ExpenseLearningContext"] = None


class ExpenseDuplicateCheck(BaseModel):
    upload_id: Optional[str] = None
    vendor: str
    amount: float = Field(gt=0)
    date: date

    @field_validator("upload_id", mode="before")
    @classmethod
    def normalize_upload_id(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        normalized = value.strip()
        return normalized or None

    @field_validator("vendor", mode="before")
    @classmethod
    def normalize_vendor(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        return value.strip()

    @field_validator("vendor")
    @classmethod
    def validate_vendor(cls, value: str) -> str:
        if not value:
            raise ValueError("Vendor is required.")
        return value


class ExpenseLearningContext(BaseModel):
    observed_vendor: Optional[str] = None
    observed_category: Optional[ExpenseCategory] = None

    @field_validator("observed_vendor", mode="before")
    @classmethod
    def normalize_observed_vendor(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @field_validator("observed_category", mode="before")
    @classmethod
    def normalize_observed_category(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip().lower()
            return normalized or None
        return value


class ExpenseCreate(ExpenseFieldsBase):
    upload_id: str
    learning_context: Optional[ExpenseLearningContext] = None

    @field_validator("upload_id", mode="before")
    @classmethod
    def normalize_upload_id(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        return value.strip()

    @field_validator("upload_id")
    @classmethod
    def validate_upload_id(cls, value: str) -> str:
        if not value:
            raise ValueError("Upload ID is required.")
        return value


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


class DuplicateExpenseRecord(ExpenseRecord):
    match_reason: str
    date_distance_days: int


class ExpenseDuplicateResponse(BaseModel):
    items: List[DuplicateExpenseRecord]
    total: int
