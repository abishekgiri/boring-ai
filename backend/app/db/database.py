from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.core.config import get_settings
from app.db.models import CREATE_EXPENSES_TABLE_SQL
from app.schemas.expenses import ExpenseCreate, ExpenseRecord


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
