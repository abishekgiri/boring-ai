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


CREATE_VENDOR_HINTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS vendor_learning_hints (
    vendor_key TEXT PRIMARY KEY,
    preferred_vendor TEXT NOT NULL,
    preferred_category TEXT,
    usage_count INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
)
"""
