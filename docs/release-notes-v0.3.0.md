# boring-ai v0.3.0

Self-hosted AI receipt processing with stronger trust, richer extraction, and a smarter workspace.

## Highlights

- document classification for receipts, invoices, and unknown files
- OCR preprocessing and cleanup before extraction
- richer receipt extraction:
  - subtotal
  - tax amount
  - receipt number
  - due date
  - payment method
  - line items
- extraction provenance and field-level confidence
- audit trail and saved-detail visibility for original extraction quality
- correction learning for vendor normalization and category hints
- duplicate detection before save and duplicate surfacing in the workspace
- review-priority workspace triage with summary cards and active-view hints

## Core workflow

```text
Upload -> OCR -> Extract -> Review -> Save -> Browse -> Export
```

## Verification

- backend compile check passed
- frontend production build passed
- extraction eval suite passed: `5/5` cases and `45/45` field checks
- mixed-record workspace QA passed for:
  - review-priority sorting
  - review-status filters
  - document-type filters
  - duplicate-only view
  - filtered export alignment

## Notes

This is still a pre-1.0 release, but it is now much stronger on trust and day-to-day bookkeeping review.

## Next likely areas

- final deployed release sanity pass
- richer saved-detail line-item presentation
- more extraction benchmark cases
