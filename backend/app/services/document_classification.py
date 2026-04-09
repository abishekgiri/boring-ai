from __future__ import annotations

import re

from app.schemas.uploads import DocumentClassification


RECEIPT_PATTERNS = (
    (r"\breceipt total\b", 4, "A receipt total line was detected."),
    (r"\bonline receipt\b", 4, "The document explicitly labels itself as a receipt."),
    (r"\breceipt\b", 3, "The OCR text includes receipt-specific language."),
    (r"\bsubtotal\b", 2, "A subtotal line was detected."),
    (r"\bsales tax\b|\btax\b", 2, "A tax line was detected."),
    (r"\bpayment\b", 1, "Payment instructions were detected."),
    (r"\bqty\b|\bdescription\b|\bunit price\b", 1, "An itemized section was detected."),
)

INVOICE_PATTERNS = (
    (r"\binvoice\b", 4, "The OCR text includes invoice-specific language."),
    (r"\bbill to\b", 2, "A billing section was detected."),
    (r"\bship to\b", 2, "A shipping section was detected."),
    (r"\bdue date\b", 3, "A due date line was detected."),
    (r"\bamount due\b|\bbalance due\b", 3, "A payable amount line was detected."),
    (r"\bterms\b", 1, "Invoice-style payment terms were detected."),
    (r"\bp\.?o\.?\s*#\b|\bpo #\b", 1, "A purchase-order reference was detected."),
)

UI_NOISE_PATTERNS = (
    r"\bpull request\b",
    r"\bfiles changed\b",
    r"\bconversation\b",
    r"\breviewers\b",
    r"\bgithub\b",
    r"\bcommented\b",
    r"\bmerge\b",
    r"\bchecks\b",
    r"\bbranch\b",
)

AMOUNT_PATTERN = re.compile(r"\d[\d,]*\.\d{2}")


def _collect_matches(text: str, patterns: tuple[tuple[str, int, str], ...]) -> tuple[int, list[str]]:
    score = 0
    positives: list[str] = []

    for pattern, weight, description in patterns:
        if re.search(pattern, text):
            score += weight
            positives.append(description)

    return score, positives


def classify_document(
    *,
    ocr_text: str,
    filename: str | None = None,
    content_type: str | None = None,
) -> DocumentClassification:
    normalized_text = " ".join(str(ocr_text or "").lower().split())
    normalized_filename = str(filename or "").lower()
    normalized_content_type = str(content_type or "").lower()

    receipt_score, receipt_signals = _collect_matches(normalized_text, RECEIPT_PATTERNS)
    invoice_score, invoice_signals = _collect_matches(normalized_text, INVOICE_PATTERNS)
    ui_noise_score = sum(
        1 for pattern in UI_NOISE_PATTERNS if re.search(pattern, normalized_text)
    )

    amount_matches = AMOUNT_PATTERN.findall(normalized_text)
    if len(amount_matches) >= 2:
        receipt_score += 1
        invoice_score += 1
        receipt_signals.append("Multiple amount-like values were detected.")
        invoice_signals.append("Multiple amount-like values were detected.")

    if "receipt" in normalized_filename:
        receipt_score += 1
        receipt_signals.append("The file name suggests this is a receipt.")
    elif "invoice" in normalized_filename:
        invoice_score += 1
        invoice_signals.append("The file name suggests this is an invoice.")

    if normalized_content_type == "application/pdf":
        invoice_score += 1
        invoice_signals.append("PDFs often contain invoice-style layouts.")

    if ui_noise_score >= 2 and receipt_score < 4 and invoice_score < 4:
        return DocumentClassification(
            document_type="unknown",
            level="warning",
            badge="Unknown document",
            summary="The OCR text looks more like app or webpage content than a financial document.",
            reason="Detected UI-like language without enough receipt or invoice cues to trust the document type.",
            positives=[],
            warnings=[
                "This file may be a screenshot or non-expense document.",
                "Continue only if you plan to review every extracted field manually.",
            ],
        )

    if receipt_score >= invoice_score + 2 and receipt_score >= 4:
        level = "strong" if receipt_score >= 7 else "caution"
        warnings = (
            []
            if level == "strong"
            else ["Some invoice-like cues were also detected, so review due dates and references carefully."]
        )
        return DocumentClassification(
            document_type="receipt",
            level=level,
            badge="Looks like a receipt",
            summary="The document has strong receipt cues, so the extraction flow is using the right kind of source material.",
            reason="Detected receipt-specific totals, tax, or itemized structure in the OCR text.",
            positives=receipt_signals[:4],
            warnings=warnings,
        )

    if invoice_score >= 4:
        level = "strong" if invoice_score >= 7 else "caution"
        warnings = [
            "Invoices can still be useful here, but review totals, due dates, and payment terms carefully before saving."
        ]
        return DocumentClassification(
            document_type="invoice",
            level=level,
            badge="Looks like an invoice",
            summary="The document reads more like an invoice than a till-style receipt, so some extracted fields may need extra review.",
            reason="Detected invoice-specific cues such as bill-to, due date, or invoice wording.",
            positives=invoice_signals[:4],
            warnings=warnings,
        )

    warnings = []
    if len(amount_matches) < 2:
        warnings.append("Only weak amount signals were detected in the OCR text.")
    warnings.append("No strong receipt or invoice pattern was detected.")

    return DocumentClassification(
        document_type="unknown",
        level="warning",
        badge="Unknown document",
        summary="The OCR text does not clearly look like a receipt or invoice, so extraction should be treated as a rough draft.",
        reason="The document lacks enough financial-structure cues to classify it confidently.",
        positives=[],
        warnings=warnings,
    )
