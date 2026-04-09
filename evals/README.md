# Receipt extraction evals

This folder contains a small benchmark for `boring-ai` receipt extraction.

The goal is to make extraction quality measurable instead of relying on
eyeballing the demo flow.

## What is included

- `receipt_extraction_cases.json` lists the current benchmark cases
- `run_receipt_extraction.py` runs the extractor against each case and compares
  the result against expected JSON

## Current cases

- `east-repair-clean-ocr`
  Clean OCR text should recover vendor, total, date, and category.
- `east-repair-messy-ocr`
  Messy OCR should still recover a safe draft and avoid inventing a bad date.

## Run it

```bash
cd backend
./.venv/bin/python ../evals/run_receipt_extraction.py
```

The script prints per-case results plus a simple summary:

- cases passed
- field accuracy across vendor, amount, date, and category

It exits with a non-zero code if any case fails, so it can also be used in CI
later.
