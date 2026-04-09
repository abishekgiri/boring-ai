from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status

from app.core.config import get_settings
from app.db.models import CREATE_EXPENSES_TABLE_SQL
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
        connection.commit()


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
