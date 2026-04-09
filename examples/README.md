# Demo examples

This folder contains sample OCR text and expected structured output for the
bundled demo receipt.

- `east-repair-clean-ocr.txt` shows a clean OCR result that should recover the
  full structured record, including the receipt date.
- `east-repair-messy-ocr.txt` shows a noisy OCR result that still maps to a
  useful expense draft.
- `east-repair-expected.json` shows the safe structured result we expect after
  extraction and review for the clean OCR case.
- `east-repair-messy-expected.json` shows the safe structured result we expect
  for the messy OCR case, including a `null` date when the OCR is too noisy to
  trust.

The demo receipt image used by the frontend lives at
`frontend/public/demo/east-repair-receipt.svg`.
