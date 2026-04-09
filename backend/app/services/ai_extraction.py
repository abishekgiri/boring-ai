from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from urllib import error, request

from fastapi import HTTPException, status

from app.core.config import get_settings
from app.schemas.uploads import ExtractedExpenseFields


EXPENSE_CATEGORIES = [
    "meals",
    "travel",
    "software",
    "office",
    "shopping",
    "transport",
    "lodging",
    "utilities",
    "other",
]

COMPANY_HINTS = (
    "inc",
    "llc",
    "ltd",
    "corp",
    "co",
    "company",
    "repair",
    "store",
    "market",
    "shop",
    "cafe",
    "restaurant",
    "hotel",
)

VENDOR_EXCLUSION_HINTS = (
    "bill to",
    "ship to",
    "receipt #",
    "receipt date",
    "invoice",
    "po #",
    "p.o.#",
    "due date",
    "payment",
    "terms",
    "routing",
    "sales tax",
    "subtotal",
    "amount due",
    "unit price",
    "qty",
    "description",
)

CATEGORY_KEYWORDS = {
    "meals": (
        "restaurant",
        "cafe",
        "coffee",
        "lunch",
        "dinner",
        "breakfast",
        "food",
        "meal",
        "pizza",
        "burger",
    ),
    "travel": (
        "hotel",
        "flight",
        "airline",
        "airbnb",
        "booking",
        "trip",
    ),
    "software": (
        "software",
        "subscription",
        "saas",
        "adobe",
        "figma",
        "notion",
        "github",
        "vercel",
        "render",
        "openai",
        "slack",
        "linear",
        "aws",
    ),
    "office": (
        "office",
        "printer",
        "paper",
        "staples",
        "stationery",
        "supplies",
    ),
    "shopping": (
        "walmart",
        "target",
        "amazon",
        "market",
        "store",
        "retail",
        "shopping",
    ),
    "transport": (
        "uber",
        "lyft",
        "taxi",
        "transport",
        "parking",
        "toll",
        "gas",
        "fuel",
        "brake",
        "pedal",
        "repair",
        "auto",
        "car",
        "vehicle",
        "cable",
        "labor",
    ),
    "lodging": (
        "lodging",
        "hotel",
        "motel",
        "inn",
        "suite",
        "hostel",
    ),
    "utilities": (
        "utility",
        "electric",
        "water",
        "internet",
        "phone",
        "wireless",
        "electricity",
    ),
}

DATE_FORMATS = (
    "%m/%d/%Y",
    "%m/%d/%y",
    "%m-%d-%Y",
    "%m-%d-%y",
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d/%m/%y",
    "%d-%m-%Y",
    "%d-%m-%y",
    "%m%d%Y",
    "%m%d%y",
    "%d%m%Y",
    "%d%m%y",
)

GENERIC_VENDOR_HINTS = (
    "receipt",
    "invoice",
    "bill to",
    "ship to",
    "customer",
    "payment",
    "terms",
    "subtotal",
    "amount due",
)


@dataclass(frozen=True)
class HeuristicFieldCandidate:
    value: str | float | None
    source: str | None = None


@dataclass(frozen=True)
class HeuristicExtractionCandidates:
    vendor: HeuristicFieldCandidate
    amount: HeuristicFieldCandidate
    date: HeuristicFieldCandidate
    category: HeuristicFieldCandidate


def _extraction_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "vendor": {
                "type": ["string", "null"],
                "description": "The most likely merchant or vendor name on the receipt.",
            },
            "amount": {
                "type": ["number", "null"],
                "description": "The final total amount paid on the receipt.",
            },
            "date": {
                "type": ["string", "null"],
                "description": "The receipt or invoice date in YYYY-MM-DD format when known.",
                "format": "date",
            },
            "category": {
                "anyOf": [
                    {
                        "type": "string",
                        "enum": EXPENSE_CATEGORIES,
                    },
                    {
                        "type": "null",
                    },
                ],
                "description": "A simple expense category for the receipt.",
            },
        },
        "required": ["vendor", "amount", "date", "category"],
        "additionalProperties": False,
    }


def _response_payload(
    ocr_text: str, heuristic_candidates: HeuristicExtractionCandidates
) -> dict:
    heuristic_lines: list[str] = []
    if heuristic_candidates.vendor.value:
        heuristic_lines.append(
            f"- vendor candidate: {heuristic_candidates.vendor.value} ({heuristic_candidates.vendor.source})"
        )
    if heuristic_candidates.amount.value is not None:
        heuristic_lines.append(
            f"- amount candidate: {heuristic_candidates.amount.value} ({heuristic_candidates.amount.source})"
        )
    if heuristic_candidates.date.value:
        heuristic_lines.append(
            f"- date candidate: {heuristic_candidates.date.value} ({heuristic_candidates.date.source})"
        )
    if heuristic_candidates.category.value:
        heuristic_lines.append(
            f"- category candidate: {heuristic_candidates.category.value} ({heuristic_candidates.category.source})"
        )

    heuristic_section = "\n".join(heuristic_lines) or "- no strong heuristic candidates were found"

    return {
        "model": get_settings().openai_model,
        "input": [
            {
                "role": "system",
                "content": (
                    "You extract structured expense data from OCR receipt text. "
                    "Return only JSON that matches the provided schema. "
                    "You are part of a hybrid extraction pipeline. Deterministic receipt parsing has already proposed "
                    "grounded candidates for some fields. Use those candidates when they match the OCR evidence, and "
                    "only override them when the OCR clearly supports a better answer. "
                    "Prefer the merchant or business header as vendor, not bill-to, ship-to, "
                    "customer names, payer names, or signatures. "
                    "Use the final paid total, such as receipt total, amount due, total due, "
                    "or grand total. Never use subtotal, sales tax alone, unit price, or line-item amounts as the final amount. "
                    "Use the receipt date or invoice date, not the due date, when both are present. "
                    "Correct obvious OCR mistakes when the intended text is clear. "
                    "Map car repairs, rides, fuel, parking, tolls, and vehicle maintenance to the transport category. "
                    "If a field cannot be determined confidently, return null."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Extract receipt fields from the OCR text below.\n\n"
                    "Priorities:\n"
                    "- vendor should be the seller or merchant\n"
                    "- amount should be the final total actually charged\n"
                    "- date should be the receipt or invoice date\n"
                    "- category should use the provided enum only\n\n"
                    "Heuristic candidates from deterministic parsing:\n"
                    f"{heuristic_section}\n\n"
                    f"OCR text:\n{ocr_text}"
                ),
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "expense_extraction",
                "strict": True,
                "schema": _extraction_schema(),
            }
        },
    }


def _extract_output_text(response_payload: dict) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    refusal_message = None
    for item in response_payload.get("output", []):
        if item.get("type") != "message":
            continue

        for content in item.get("content", []):
            content_type = content.get("type")
            if content_type == "output_text" and content.get("text"):
                return str(content["text"])
            if content_type == "refusal" and content.get("refusal"):
                refusal_message = str(content["refusal"])

    if refusal_message:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Model refused extraction: {refusal_message}",
        )

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="OpenAI did not return structured extraction output.",
    )


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip(" :-\t")


def _iter_non_empty_lines(ocr_text: str) -> list[str]:
    return [_clean_line(line) for line in ocr_text.splitlines() if _clean_line(line)]


def _has_company_hint(line: str) -> bool:
    normalized_line = line.lower()
    return any(
        f" {hint}" in f" {normalized_line} " or normalized_line.endswith(f".{hint}")
        for hint in COMPANY_HINTS
    )


def _looks_like_person_name(value: str) -> bool:
    parts = [part for part in re.split(r"\s+", value.strip()) if part]
    if not 2 <= len(parts) <= 3:
        return False

    if any(_has_company_hint(part) for part in parts):
        return False

    return all(part.replace(".", "").isalpha() for part in parts)


def _normalize_match_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _text_contains_candidate(haystack: str, needle: str) -> bool:
    normalized_needle = _normalize_match_text(needle)
    if not normalized_needle:
        return False

    return normalized_needle in _normalize_match_text(haystack)


def _looks_like_generic_vendor(value: str) -> bool:
    normalized_value = value.strip().lower()
    if not normalized_value:
        return True

    return any(hint in normalized_value for hint in GENERIC_VENDOR_HINTS)


def _extract_vendor_from_ocr(ocr_text: str) -> str | None:
    candidates: list[tuple[int, str]] = []

    for index, line in enumerate(_iter_non_empty_lines(ocr_text)[:12]):
        normalized_line = line.lower()
        if any(hint in normalized_line for hint in VENDOR_EXCLUSION_HINTS):
            continue

        if not re.search(r"[a-zA-Z]", line):
            continue

        score = 0
        if index == 0:
            score += 6
        elif index <= 2:
            score += 3

        if _has_company_hint(line):
            score += 6

        if line.isupper():
            score += 2

        if line[:1].isdigit():
            score -= 4

        if any(char.isdigit() for char in line):
            score -= 2

        if _looks_like_person_name(line):
            score -= 4

        if len(line) > 70:
            score -= 2

        candidates.append((score, line))

    if not candidates:
        return None

    best_score, best_line = max(candidates, key=lambda item: item[0])
    return best_line if best_score > 0 else None


def _extract_vendor_candidate(ocr_text: str) -> HeuristicFieldCandidate:
    vendor = _extract_vendor_from_ocr(ocr_text)
    if not vendor:
        return HeuristicFieldCandidate(value=None, source=None)

    return HeuristicFieldCandidate(value=vendor, source="header_vendor")


def _extract_money_values(line: str) -> list[float]:
    values: list[float] = []
    for match in re.finditer(r"(?<!\d)(\d[\d,]*\.\d{2})(?!\d)", line):
        try:
            values.append(float(match.group(1).replace(",", "")))
        except ValueError:
            continue
    return values


def _extract_amount_candidates(
    line: str,
    *,
    allow_implied_cents: bool = False,
    drop_percentage_values: bool = False,
) -> list[tuple[int, float, str]]:
    percentage_ranges = [
        match.span()
        for match in re.finditer(r"\d[\d,]*(?:\.\d+)?\s*%", line)
    ]
    candidates: list[tuple[int, float, str]] = []

    for match in re.finditer(r"(?<!\d)(\d[\d,]*\.\d{2})(?!\d)", line):
        if drop_percentage_values and any(
            start <= match.start() < end for start, end in percentage_ranges
        ):
            continue

        try:
            candidates.append(
                (match.start(), float(match.group(1).replace(",", "")), "decimal")
            )
        except ValueError:
            continue

    if allow_implied_cents:
        for match in re.finditer(r"(?<![\d.])(\d{3,6})(?![\d.])", line):
            if drop_percentage_values and any(
                start <= match.start() < end for start, end in percentage_ranges
            ):
                continue

            token = match.group(1)
            try:
                candidates.append((match.start(), int(token) / 100, "implied_cents"))
            except ValueError:
                continue

    return sorted(candidates, key=lambda item: item[0])


def _extract_percentage(line: str) -> float | None:
    match = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*%", line)
    if not match:
        return None

    try:
        return float(match.group(1).replace(",", ""))
    except ValueError:
        return None


def _extract_labeled_amount(
    ocr_text: str,
    *,
    include_labels: tuple[str, ...],
    exclude_labels: tuple[str, ...] = (),
    allow_implied_cents: bool = False,
) -> float | None:
    candidates: list[tuple[int, float]] = []

    for line in _iter_non_empty_lines(ocr_text):
        normalized_line = line.lower()
        if not any(label in normalized_line for label in include_labels):
            continue

        if any(label in normalized_line for label in exclude_labels):
            continue

        line_candidates = _extract_amount_candidates(
            line,
            allow_implied_cents=allow_implied_cents,
            drop_percentage_values=True,
        )
        if not line_candidates:
            continue

        candidates.append((line_candidates[-1][0], line_candidates[-1][1]))

    if not candidates:
        return None

    return max(candidates, key=lambda item: item[0])[1]


def _looks_like_item_row(line: str) -> bool:
    normalized_line = line.lower()
    if "qty" in normalized_line and "amount" in normalized_line:
        return False

    if "unit price" in normalized_line:
        return False

    quantity_match = re.match(r"^(\d{1,2})\s+", line.strip())
    if not quantity_match:
        return False

    candidates = _extract_amount_candidates(
        line,
        allow_implied_cents=True,
        drop_percentage_values=True,
    )
    return len(candidates) >= 2


def _extract_line_item_amounts(ocr_text: str) -> list[float]:
    amounts: list[float] = []

    for line in _iter_non_empty_lines(ocr_text):
        if not _looks_like_item_row(line):
            continue

        candidates = _extract_amount_candidates(
            line,
            allow_implied_cents=True,
            drop_percentage_values=True,
        )
        if candidates:
            amounts.append(candidates[-1][1])

    return amounts


def _extract_tax_amount(ocr_text: str, subtotal: float | None) -> float | None:
    tax_candidates: list[float] = []

    for line in _iter_non_empty_lines(ocr_text):
        normalized_line = line.lower()
        if "tax" not in normalized_line and not (
            "sales" in normalized_line and "%" in normalized_line
        ):
            continue

        amount_candidates = _extract_amount_candidates(
            line,
            allow_implied_cents=True,
            drop_percentage_values=True,
        )
        decimal_candidates = [
            value for _, value, value_type in amount_candidates if value_type == "decimal"
        ]
        implied_candidates = [
            value
            for _, value, value_type in amount_candidates
            if value_type == "implied_cents"
        ]

        percentage = _extract_percentage(line)
        if decimal_candidates:
            tax_candidates.append(decimal_candidates[-1])
            continue

        if subtotal is not None and percentage is not None:
            tax_candidates.append(round(subtotal * (percentage / 100), 2))
            continue

        if implied_candidates:
            tax_candidates.append(implied_candidates[-1])

    if not tax_candidates:
        return None

    return tax_candidates[-1]


def _extract_total_amount_from_ocr(ocr_text: str) -> float | None:
    amount, _ = _extract_total_amount_candidate(ocr_text)
    return amount


def _extract_total_amount_candidate(ocr_text: str) -> tuple[float | None, str | None]:
    amount_candidates: list[tuple[int, float, str]] = []

    priority_rules = (
        ("receipt total", 100, "receipt_total"),
        ("grand total", 95, "grand_total"),
        ("amount due", 90, "amount_due"),
        ("total due", 90, "amount_due"),
        ("balance due", 85, "balance_due"),
        ("invoice total", 85, "invoice_total"),
        ("total", 70, "labeled_total"),
    )

    ignore_hints = ("subtotal", "tax", "unit price", "routing", "qty", "amount$")

    for line in _iter_non_empty_lines(ocr_text):
        normalized_line = line.lower()
        values = _extract_amount_candidates(
            line,
            allow_implied_cents=True,
            drop_percentage_values=True,
        )
        if not values:
            continue

        for label, base_score, source in priority_rules:
            if label not in normalized_line:
                continue

            if label == "total" and any(
                ignored_hint in normalized_line for ignored_hint in ignore_hints
            ):
                continue

            amount_candidates.append((base_score, values[-1][1], source))

    if amount_candidates:
        _, amount, source = max(amount_candidates, key=lambda item: (item[0], item[1]))
        return amount, source

    subtotal = _extract_labeled_amount(
        ocr_text,
        include_labels=("subtotal",),
        allow_implied_cents=True,
    )
    if subtotal is None:
        line_item_amounts = _extract_line_item_amounts(ocr_text)
        if line_item_amounts:
            subtotal = round(sum(line_item_amounts), 2)

    tax_amount = _extract_tax_amount(ocr_text, subtotal)
    if subtotal is not None and tax_amount is not None:
        return round(subtotal + tax_amount, 2), "subtotal_plus_tax"

    if subtotal is not None:
        return subtotal, "subtotal_only"

    fallback_values: list[float] = []
    for line in _iter_non_empty_lines(ocr_text):
        normalized_line = line.lower()
        if any(
            ignored_hint in normalized_line for ignored_hint in ("unit price", "routing")
        ):
            continue
        fallback_values.extend(_extract_money_values(normalized_line))

    if fallback_values:
        return max(fallback_values), "largest_visible_amount"

    return None, None


def _normalize_date_candidates(value: str) -> list[str]:
    stripped = value.strip()
    if not stripped:
        return []

    variants = [stripped]
    conservative_ocr_normalized = stripped.translate(
        str.maketrans(
            {
                "O": "0",
                "o": "0",
                "Q": "0",
                "D": "0",
                "I": "1",
                "l": "1",
                "|": "1",
                "Z": "2",
                "z": "2",
                "B": "8",
            }
        )
    )
    variants.append(conservative_ocr_normalized)
    variants.append(re.sub(r"[^0-9]+", "/", conservative_ocr_normalized).strip("/"))
    digits_only = re.sub(r"[^0-9]", "", conservative_ocr_normalized)
    if len(digits_only) in (6, 8):
        variants.append(digits_only)

    normalized_variants: list[str] = []
    for candidate in variants:
        candidate = candidate.strip()
        if candidate and candidate not in normalized_variants:
            normalized_variants.append(candidate)

    return normalized_variants


def _parse_date_token(value: str) -> str | None:
    for normalized_value in _normalize_date_candidates(value):
        for date_format in DATE_FORMATS:
            try:
                return datetime.strptime(normalized_value, date_format).date().isoformat()
            except ValueError:
                continue
    return None


def _extract_date_from_ocr(ocr_text: str) -> str | None:
    parsed_date, _ = _extract_date_candidate(ocr_text)
    return parsed_date


def _extract_date_candidate(ocr_text: str) -> tuple[str | None, str | None]:
    primary_candidates: list[tuple[int, str, str]] = []
    secondary_candidates: list[tuple[int, str, str]] = []
    generic_pattern = re.compile(r"\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b")
    labeled_token_pattern = re.compile(r"[A-Za-z0-9/-]{6,16}")
    saw_primary_date_label = False

    for line in _iter_non_empty_lines(ocr_text):
        normalized_line = line.lower()
        matches = generic_pattern.findall(line)
        if "date" in normalized_line:
            matches.extend(labeled_token_pattern.findall(line))
        if not matches:
            continue

        score = 10
        source = "unlabeled_date"
        if "receipt date" in normalized_line:
            score = 100
            saw_primary_date_label = True
            source = "receipt_date"
        elif "invoice date" in normalized_line:
            score = 95
            saw_primary_date_label = True
            source = "invoice_date"
        elif "date" in normalized_line and "due date" not in normalized_line:
            score = 80
            saw_primary_date_label = True
            source = "labeled_date"
        elif "due date" in normalized_line:
            score = 20
            source = "due_date"

        for match in matches:
            parsed_date = _parse_date_token(match)
            if parsed_date:
                if score >= 80:
                    primary_candidates.append((score, parsed_date, source))
                else:
                    secondary_candidates.append((score, parsed_date, source))

    if primary_candidates:
        _, parsed_date, source = max(primary_candidates, key=lambda item: item[0])
        return parsed_date, source

    if saw_primary_date_label:
        return None, None

    if not secondary_candidates:
        return None, None

    _, parsed_date, source = max(secondary_candidates, key=lambda item: item[0])
    return parsed_date, source


def _infer_category_from_ocr(ocr_text: str) -> str | None:
    normalized_text = ocr_text.lower()
    scores: dict[str, int] = {}

    for category, keywords in CATEGORY_KEYWORDS.items():
        category_score = sum(
            1 for keyword in keywords if keyword in normalized_text
        )
        if category_score:
            scores[category] = category_score

    if not scores:
        return None

    return max(scores.items(), key=lambda item: item[1])[0]


def _extract_category_candidate(ocr_text: str) -> HeuristicFieldCandidate:
    category = _infer_category_from_ocr(ocr_text)
    if not category:
        return HeuristicFieldCandidate(value=None, source=None)

    return HeuristicFieldCandidate(value=category, source="keyword_inference")


def _build_heuristic_candidates(ocr_text: str) -> HeuristicExtractionCandidates:
    amount, amount_source = _extract_total_amount_candidate(ocr_text)
    date, date_source = _extract_date_candidate(ocr_text)

    return HeuristicExtractionCandidates(
        vendor=_extract_vendor_candidate(ocr_text),
        amount=HeuristicFieldCandidate(value=amount, source=amount_source),
        date=HeuristicFieldCandidate(value=date, source=date_source),
        category=_extract_category_candidate(ocr_text),
    )


def _amounts_match(first: float | None, second: float | None) -> bool:
    if first is None or second is None:
        return False

    return abs(first - second) <= 0.01


def _heuristics_to_fields(
    heuristic_candidates: HeuristicExtractionCandidates,
) -> ExtractedExpenseFields:
    return ExtractedExpenseFields.model_validate(
        {
            "vendor": heuristic_candidates.vendor.value,
            "amount": heuristic_candidates.amount.value,
            "date": heuristic_candidates.date.value,
            "category": heuristic_candidates.category.value,
        }
    )


def _has_heuristic_signal(extracted_fields: ExtractedExpenseFields) -> bool:
    return any(value is not None and value != "" for value in extracted_fields.model_dump().values())


def _merge_hybrid_extraction(
    extracted_fields: ExtractedExpenseFields,
    heuristic_candidates: HeuristicExtractionCandidates,
    ocr_text: str,
) -> ExtractedExpenseFields:
    updated_vendor = extracted_fields.vendor
    heuristic_vendor = heuristic_candidates.vendor.value
    if isinstance(heuristic_vendor, str) and heuristic_vendor:
        if (
            not updated_vendor
            or _looks_like_person_name(updated_vendor)
            or _looks_like_generic_vendor(updated_vendor)
            or (
                not _text_contains_candidate(ocr_text, updated_vendor)
                and _text_contains_candidate(ocr_text, heuristic_vendor)
            )
        ):
            updated_vendor = heuristic_vendor

    updated_amount = extracted_fields.amount
    heuristic_amount = heuristic_candidates.amount.value
    strong_amount_sources = {
        "receipt_total",
        "grand_total",
        "amount_due",
        "balance_due",
        "invoice_total",
        "labeled_total",
        "subtotal_plus_tax",
    }
    if isinstance(heuristic_amount, (int, float)):
        if updated_amount is None:
            updated_amount = float(heuristic_amount)
        elif heuristic_candidates.amount.source in strong_amount_sources and not _amounts_match(
            float(updated_amount), float(heuristic_amount)
        ):
            updated_amount = float(heuristic_amount)

    updated_date = extracted_fields.date.isoformat() if extracted_fields.date else None
    heuristic_date = heuristic_candidates.date.value
    strong_date_sources = {"receipt_date", "invoice_date", "labeled_date"}
    if isinstance(heuristic_date, str) and heuristic_date:
        if updated_date is None or heuristic_candidates.date.source in strong_date_sources:
            updated_date = heuristic_date

    updated_category = extracted_fields.category
    heuristic_category = heuristic_candidates.category.value
    if isinstance(heuristic_category, str) and heuristic_category:
        if not updated_category or updated_category == "other":
            updated_category = heuristic_category

    return ExtractedExpenseFields.model_validate(
        {
            "vendor": updated_vendor,
            "amount": updated_amount,
            "date": updated_date,
            "category": updated_category,
        }
    )


def extract_expense_fields(ocr_text: str) -> ExtractedExpenseFields:
    settings = get_settings()
    heuristic_candidates = _build_heuristic_candidates(ocr_text)
    heuristic_fields = _heuristics_to_fields(heuristic_candidates)

    if not settings.openai_api_key:
        if _has_heuristic_signal(heuristic_fields):
            return heuristic_fields

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key is not configured on the backend.",
        )

    payload = json.dumps(_response_payload(ocr_text, heuristic_candidates)).encode(
        "utf-8"
    )
    api_request = request.Request(
        url=f"{settings.openai_api_base_url}/responses",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with request.urlopen(
            api_request,
            timeout=settings.openai_timeout_seconds,
        ) as api_response:
            response_payload = json.loads(api_response.read().decode("utf-8"))
    except error.HTTPError as exc:
        error_body = exc.read().decode("utf-8")
        try:
            parsed_body = json.loads(error_body)
            detail = parsed_body.get("error", {}).get("message") or error_body
        except json.JSONDecodeError:
            detail = error_body or "OpenAI request failed."

        if _has_heuristic_signal(heuristic_fields):
            return heuristic_fields

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI extraction request failed: {detail}",
        ) from exc
    except error.URLError as exc:
        if _has_heuristic_signal(heuristic_fields):
            return heuristic_fields

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach the OpenAI API for receipt extraction.",
        ) from exc

    try:
        response_text = _extract_output_text(response_payload)
    except HTTPException as exc:
        if _has_heuristic_signal(heuristic_fields):
            return heuristic_fields
        raise exc

    try:
        parsed_output = json.loads(response_text)
    except json.JSONDecodeError as exc:
        if _has_heuristic_signal(heuristic_fields):
            return heuristic_fields

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenAI returned invalid JSON for receipt extraction.",
        ) from exc

    try:
        extracted_fields = ExtractedExpenseFields.validate_llm_output(parsed_output)
    except ValueError as exc:
        if _has_heuristic_signal(heuristic_fields):
            return heuristic_fields

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return _merge_hybrid_extraction(extracted_fields, heuristic_candidates, ocr_text)
