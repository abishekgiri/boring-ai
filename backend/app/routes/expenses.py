from __future__ import annotations

import csv
from datetime import date
from io import StringIO
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Response, status

from app.core.config import get_settings
from app.db.database import (
    annotate_duplicate_expenses,
    delete_expense_by_id,
    find_duplicate_expenses,
    get_expense_by_id,
    insert_expense,
    list_expenses,
    record_learning_hint,
    update_expense_by_id,
)
from app.schemas.expenses import (
    ExpenseCreate,
    ExpenseDuplicateCheck,
    ExpenseDuplicateResponse,
    DuplicateExpenseRecord,
    ExpenseListResponse,
    ExpenseRecord,
    ExpenseUpdate,
)
from app.schemas.uploads import DocumentType, ExpenseCategory
from app.services.file_storage import get_upload_metadata


router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def _build_file_path(stored_filename: str) -> str:
    settings = get_settings()
    return str(Path(settings.backend_root.name) / "uploads" / "files" / stored_filename)


def _get_filtered_expenses(
    *,
    search: Optional[str] = None,
    category: Optional[ExpenseCategory] = None,
    document_type: Optional[DocumentType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort_by: str = "date",
    sort_dir: str = "desc",
    duplicates_only: bool = False,
) -> list[ExpenseRecord]:
    normalized_search = search.strip().lower() if search else None
    normalized_category = category.strip().lower() if category else None
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be on or before date_to.",
        )
    if sort_by not in {"date", "amount"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sort_by must be either 'date' or 'amount'.",
        )
    if sort_dir not in {"asc", "desc"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sort_dir must be either 'asc' or 'desc'.",
        )

    items = list_expenses(
        search=normalized_search or None,
        category=normalized_category or None,
        date_from=date_from,
        date_to=date_to,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    annotated_items = annotate_duplicate_expenses(items)
    enriched_items: list[ExpenseRecord] = []
    for item in annotated_items:
        try:
            upload_record = get_upload_metadata(item.upload_id)
        except HTTPException:
            enriched_items.append(item)
            continue

        classification = upload_record.document_classification
        if document_type and (
            classification is None or classification.document_type != document_type
        ):
            continue

        enriched_items.append(
            item.model_copy(
                update={
                    "document_type": (
                        classification.document_type if classification else None
                    ),
                    "document_badge": (
                        classification.badge if classification else None
                    ),
                }
            )
        )

    if duplicates_only:
        return [item for item in enriched_items if item.has_possible_duplicate]

    return enriched_items


def _build_duplicate_match_reason(
    candidate: ExpenseRecord, payload: ExpenseDuplicateCheck
) -> str:
    reasons = ["same vendor", "same amount"]
    if candidate.date == payload.date:
        reasons.append("same date")
    else:
        day_distance = abs((candidate.date - payload.date).days)
        reasons.append(f"{day_distance}-day date gap")

    return ", ".join(reasons)


@router.post("", response_model=ExpenseRecord, status_code=201)
def create_expense(payload: ExpenseCreate) -> ExpenseRecord:
    upload_record = get_upload_metadata(payload.upload_id)
    if not upload_record.ocr_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="OCR text is missing. Run OCR before saving an expense.",
        )

    expense_record = insert_expense(
        payload,
        file_path=_build_file_path(upload_record.stored_filename),
        raw_ocr_text=upload_record.ocr_text,
    )

    if payload.learning_context:
        record_learning_hint(
            observed_vendor=payload.learning_context.observed_vendor,
            observed_category=payload.learning_context.observed_category,
            final_vendor=expense_record.vendor,
            final_category=expense_record.category,
        )

    return expense_record


@router.post("/check-duplicates", response_model=ExpenseDuplicateResponse)
def check_duplicate_expenses(payload: ExpenseDuplicateCheck) -> ExpenseDuplicateResponse:
    items = find_duplicate_expenses(
        vendor=payload.vendor,
        amount=payload.amount,
        expense_date=payload.date,
        exclude_upload_id=payload.upload_id,
    )

    duplicate_items = [
        DuplicateExpenseRecord(
            **item.model_dump(),
            match_reason=_build_duplicate_match_reason(item, payload),
            date_distance_days=abs((item.date - payload.date).days),
        )
        for item in items
    ]

    return ExpenseDuplicateResponse(items=duplicate_items, total=len(duplicate_items))


@router.get("", response_model=ExpenseListResponse)
def read_expenses(
    search: Optional[str] = None,
    category: Optional[ExpenseCategory] = None,
    document_type: Optional[DocumentType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort_by: str = "date",
    sort_dir: str = "desc",
    duplicates_only: bool = False,
) -> ExpenseListResponse:
    items = _get_filtered_expenses(
        search=search,
        category=category,
        document_type=document_type,
        date_from=date_from,
        date_to=date_to,
        sort_by=sort_by,
        sort_dir=sort_dir,
        duplicates_only=duplicates_only,
    )
    return ExpenseListResponse(items=items, total=len(items))


@router.get("/export")
def export_expenses(
    search: Optional[str] = None,
    category: Optional[ExpenseCategory] = None,
    document_type: Optional[DocumentType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort_by: str = "date",
    sort_dir: str = "desc",
    duplicates_only: bool = False,
) -> Response:
    items = _get_filtered_expenses(
        search=search,
        category=category,
        document_type=document_type,
        date_from=date_from,
        date_to=date_to,
        sort_by=sort_by,
        sort_dir=sort_dir,
        duplicates_only=duplicates_only,
    )

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "vendor", "amount", "date", "category", "file_path", "created_at"])

    for item in items:
        writer.writerow(
            [
                item.id,
                item.vendor,
                item.amount,
                item.date.isoformat(),
                item.category,
                item.file_path,
                item.created_at.isoformat(),
            ]
        )

    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="boring-ai-expenses.csv"',
        },
    )


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: int) -> Response:
    delete_expense_by_id(expense_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{expense_id}", response_model=ExpenseRecord)
def update_expense(expense_id: int, payload: ExpenseUpdate) -> ExpenseRecord:
    expense_record = update_expense_by_id(expense_id, payload)

    if payload.learning_context:
        record_learning_hint(
            observed_vendor=payload.learning_context.observed_vendor,
            observed_category=payload.learning_context.observed_category,
            final_vendor=expense_record.vendor,
            final_category=expense_record.category,
        )

    return expense_record


@router.get("/{expense_id}", response_model=ExpenseRecord)
def read_expense(expense_id: int) -> ExpenseRecord:
    return get_expense_by_id(expense_id)
