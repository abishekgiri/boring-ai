from __future__ import annotations


CREATE_EXPENSES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    vendor TEXT NOT NULL,
    amount REAL NOT NULL,
    expense_date TEXT NOT NULL,
    category TEXT NOT NULL,
    raw_ocr_text TEXT NOT NULL,
    created_at TEXT NOT NULL
)
"""

