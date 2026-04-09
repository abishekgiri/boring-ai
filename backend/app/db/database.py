from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
import re
from typing import Dict, List, Optional

from fastapi import HTTPException, status

from app.core.config import get_settings
from app.db.models import CREATE_EXPENSES_TABLE_SQL, CREATE_VENDOR_HINTS_TABLE_SQL
from app.schemas.expenses import ExpenseCreate, ExpenseRecord, ExpenseUpdate


def _get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(get_settings().sqlite_db_path)
    connection.row_factory = sqlite3.Row
    return connection


def _row_to_expense(row: sqlite3.Row) -> ExpenseRecord:
    return ExpenseRecord(
        id=row["id"],
        upload_id=row["upload_id"],
        file_path=row["file_path"],
        vendor=row["vendor"],
        amount=row["amount"],
        date=row["expense_date"],
        category=row["category"],
        raw_ocr_text=row["raw_ocr_text"],
        created_at=row["created_at"],
    )


def initialize_database() -> None:
    with closing(_get_connection()) as connection:
        connection.execute(CREATE_EXPENSES_TABLE_SQL)
        connection.execute(CREATE_VENDOR_HINTS_TABLE_SQL)
        connection.commit()


def _normalize_vendor_for_match(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _record_vendor_learning_hint(
    *,
    observed_vendor: str,
    preferred_vendor: str,
    preferred_category: Optional[str],
) -> None:
    vendor_key = _normalize_vendor_for_match(observed_vendor)
    if not vendor_key or not preferred_vendor.strip():
        return

    with closing(_get_connection()) as connection:
        connection.execute(
            """
            INSERT INTO vendor_learning_hints (
                vendor_key,
                preferred_vendor,
                preferred_category,
                usage_count,
                updated_at
            ) VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(vendor_key) DO UPDATE SET
                preferred_vendor = excluded.preferred_vendor,
                preferred_category = COALESCE(excluded.preferred_category, vendor_learning_hints.preferred_category),
                usage_count = vendor_learning_hints.usage_count + 1,
                updated_at = excluded.updated_at
            """,
            (
                vendor_key,
                preferred_vendor.strip(),
                preferred_category,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        connection.commit()


def get_vendor_learning_hint(vendor: str) -> Optional[Dict[str, object]]:
    vendor_key = _normalize_vendor_for_match(vendor)
    if not vendor_key:
        return None

    with closing(_get_connection()) as connection:
        row = connection.execute(
            """
            SELECT
                vendor_key,
                preferred_vendor,
                preferred_category,
                usage_count,
                updated_at
            FROM vendor_learning_hints
            WHERE vendor_key = ?
            """,
            (vendor_key,),
        ).fetchone()

    if row is None:
        return None

    return {
        "vendor_key": row["vendor_key"],
        "preferred_vendor": row["preferred_vendor"],
        "preferred_category": row["preferred_category"],
        "usage_count": row["usage_count"],
        "updated_at": row["updated_at"],
    }


def record_learning_hint(
    *,
    observed_vendor: Optional[str],
    observed_category: Optional[str],
    final_vendor: str,
    final_category: str,
) -> None:
    normalized_observed_vendor = (observed_vendor or "").strip()
    normalized_final_vendor = final_vendor.strip()
    normalized_observed_category = (observed_category or "").strip().lower() or None
    normalized_final_category = final_category.strip().lower()

    should_record = False
    if normalized_observed_vendor and normalized_observed_vendor != normalized_final_vendor:
        should_record = True
    if normalized_observed_category and normalized_observed_category != normalized_final_category:
        should_record = True

    if not should_record:
        return

    if normalized_observed_vendor:
        _record_vendor_learning_hint(
            observed_vendor=normalized_observed_vendor,
            preferred_vendor=normalized_final_vendor,
            preferred_category=normalized_final_category,
        )

    _record_vendor_learning_hint(
        observed_vendor=normalized_final_vendor,
        preferred_vendor=normalized_final_vendor,
        preferred_category=normalized_final_category,
    )


def _vendors_look_similar(first: str, second: str) -> bool:
    normalized_first = _normalize_vendor_for_match(first)
    normalized_second = _normalize_vendor_for_match(second)
    if not normalized_first or not normalized_second:
        return False

    if normalized_first == normalized_second:
        return True

    if len(normalized_first) >= 5 and normalized_first in normalized_second:
        return True

    if len(normalized_second) >= 5 and normalized_second in normalized_first:
        return True

    return False


def insert_expense(
    payload: ExpenseCreate,
    *,
    file_path: str,
    raw_ocr_text: str,
) -> ExpenseRecord:
    with closing(_get_connection()) as connection:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO expenses (
                    upload_id,
                    file_path,
                    vendor,
                    amount,
                    expense_date,
                    category,
                    raw_ocr_text,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.upload_id,
                    file_path,
                    payload.vendor,
                    payload.amount,
                    payload.date.isoformat(),
                    payload.category,
                    raw_ocr_text,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An expense has already been saved for this upload.",
            ) from exc

        connection.commit()
        expense_id = cursor.lastrowid

    return get_expense_by_id(expense_id)


def get_expense_by_id(expense_id: int) -> ExpenseRecord:
    with closing(_get_connection()) as connection:
        row = connection.execute(
            """
            SELECT
                id,
                upload_id,
                file_path,
                vendor,
                amount,
                expense_date,
                category,
                raw_ocr_text,
                created_at
            FROM expenses
            WHERE id = ?
            """,
            (expense_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found.",
        )

    return _row_to_expense(row)


def update_expense_by_id(expense_id: int, payload: ExpenseUpdate) -> ExpenseRecord:
    with closing(_get_connection()) as connection:
        cursor = connection.execute(
            """
            UPDATE expenses
            SET
                vendor = ?,
                amount = ?,
                expense_date = ?,
                category = ?
            WHERE id = ?
            """,
            (
                payload.vendor,
                payload.amount,
                payload.date.isoformat(),
                payload.category,
                expense_id,
            ),
        )
        connection.commit()

    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found.",
        )

    return get_expense_by_id(expense_id)


def list_expenses(
    *,
    search: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> List[ExpenseRecord]:
    query_lines = [
        """
        SELECT
            id,
            upload_id,
            file_path,
            vendor,
            amount,
            expense_date,
            category,
            raw_ocr_text,
            created_at
        FROM expenses
        WHERE 1 = 1
        """
    ]
    parameters: list[object] = []

    if search:
        query_lines.append("AND LOWER(vendor) LIKE ?")
        parameters.append(f"%{search.lower()}%")

    if category:
        query_lines.append("AND category = ?")
        parameters.append(category)

    if date_from:
        query_lines.append("AND expense_date >= ?")
        parameters.append(date_from.isoformat())

    if date_to:
        query_lines.append("AND expense_date <= ?")
        parameters.append(date_to.isoformat())

    query_lines.append("ORDER BY expense_date DESC, created_at DESC")
    query = "\n".join(query_lines)

    with closing(_get_connection()) as connection:
        rows = connection.execute(query, parameters).fetchall()

    return [_row_to_expense(row) for row in rows]


def find_duplicate_expenses(
    *,
    vendor: str,
    amount: float,
    expense_date: date,
    exclude_upload_id: Optional[str] = None,
) -> List[ExpenseRecord]:
    date_from = expense_date - timedelta(days=3)
    date_to = expense_date + timedelta(days=3)
    query_lines = [
        """
        SELECT
            id,
            upload_id,
            file_path,
            vendor,
            amount,
            expense_date,
            category,
            raw_ocr_text,
            created_at
        FROM expenses
        WHERE amount BETWEEN ? AND ?
          AND expense_date BETWEEN ? AND ?
        """
    ]
    parameters: list[object] = [
        amount - 0.01,
        amount + 0.01,
        date_from.isoformat(),
        date_to.isoformat(),
    ]

    if exclude_upload_id:
        query_lines.append("AND upload_id != ?")
        parameters.append(exclude_upload_id)

    query_lines.append(
        "ORDER BY ABS(julianday(expense_date) - julianday(?)) ASC, created_at DESC"
    )
    parameters.append(expense_date.isoformat())

    with closing(_get_connection()) as connection:
        rows = connection.execute("\n".join(query_lines), parameters).fetchall()

    candidate_records = [_row_to_expense(row) for row in rows]
    return [
        candidate
        for candidate in candidate_records
        if _vendors_look_similar(candidate.vendor, vendor)
    ]


def delete_expense_by_id(expense_id: int) -> None:
    with closing(_get_connection()) as connection:
        cursor = connection.execute(
            "DELETE FROM expenses WHERE id = ?",
            (expense_id,),
        )
        connection.commit()

    if cursor.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found.",
        )
