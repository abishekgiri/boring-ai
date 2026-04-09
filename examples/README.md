# Demo examples

This folder contains sample OCR text and expected structured output for the
bundled demo receipt.

- `east-repair-messy-ocr.txt` shows a noisy OCR result that still maps to a
  useful expense draft.
- `east-repair-expected.json` shows the safe structured result we expect after
  extraction and review.

The demo receipt image used by the frontend lives at
`frontend/public/demo/east-repair-receipt.svg`.
