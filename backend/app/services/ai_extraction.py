from __future__ import annotations

import json
import re
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


def _response_payload(ocr_text: str) -> dict:
    return {
        "model": get_settings().openai_model,
        "input": [
            {
                "role": "system",
                "content": (
                    "You extract structured expense data from OCR receipt text. "
                    "Return only JSON that matches the provided schema. "
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
    amount_candidates: list[tuple[int, float]] = []

    priority_rules = (
        ("receipt total", 100),
        ("grand total", 95),
        ("amount due", 90),
        ("total due", 90),
        ("balance due", 85),
        ("invoice total", 85),
        ("total", 70),
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

        for label, base_score in priority_rules:
            if label not in normalized_line:
                continue

            if label == "total" and any(
                ignored_hint in normalized_line for ignored_hint in ignore_hints
            ):
                continue

            amount_candidates.append((base_score, values[-1][1]))

    if amount_candidates:
        return max(amount_candidates, key=lambda item: (item[0], item[1]))[1]

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
        return round(subtotal + tax_amount, 2)

    if subtotal is not None:
        return subtotal

    fallback_values: list[float] = []
    for line in _iter_non_empty_lines(ocr_text):
        normalized_line = line.lower()
        if any(
            ignored_hint in normalized_line for ignored_hint in ("unit price", "routing")
        ):
            continue
        fallback_values.extend(_extract_money_values(normalized_line))

    return max(fallback_values) if fallback_values else None


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
    primary_candidates: list[tuple[int, str]] = []
    secondary_candidates: list[tuple[int, str]] = []
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
        if "receipt date" in normalized_line:
            score = 100
            saw_primary_date_label = True
        elif "invoice date" in normalized_line:
            score = 95
            saw_primary_date_label = True
        elif "date" in normalized_line and "due date" not in normalized_line:
            score = 80
            saw_primary_date_label = True
        elif "due date" in normalized_line:
            score = 20

        for match in matches:
            parsed_date = _parse_date_token(match)
            if parsed_date:
                if score >= 80:
                    primary_candidates.append((score, parsed_date))
                else:
                    secondary_candidates.append((score, parsed_date))

    if primary_candidates:
        return max(primary_candidates, key=lambda item: item[0])[1]

    if saw_primary_date_label:
        return None

    if not secondary_candidates:
        return None

    return max(secondary_candidates, key=lambda item: item[0])[1]


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


def _apply_fallbacks(
    extracted_fields: ExtractedExpenseFields,
    ocr_text: str,
) -> ExtractedExpenseFields:
    fallback_vendor = _extract_vendor_from_ocr(ocr_text)
    fallback_amount = _extract_total_amount_from_ocr(ocr_text)
    fallback_date = _extract_date_from_ocr(ocr_text)
    fallback_category = _infer_category_from_ocr(ocr_text)

    updated_vendor = extracted_fields.vendor
    if fallback_vendor and (
        not updated_vendor or _looks_like_person_name(updated_vendor)
    ):
        updated_vendor = fallback_vendor

    updated_amount = fallback_amount if fallback_amount is not None else extracted_fields.amount

    updated_date = fallback_date or (
        extracted_fields.date.isoformat() if extracted_fields.date else None
    )

    updated_category = extracted_fields.category
    if fallback_category and (
        not updated_category or updated_category == "other"
    ):
        updated_category = fallback_category

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

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key is not configured on the backend.",
        )

    payload = json.dumps(_response_payload(ocr_text)).encode("utf-8")
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

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI extraction request failed: {detail}",
        ) from exc
    except error.URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach the OpenAI API for receipt extraction.",
        ) from exc

    response_text = _extract_output_text(response_payload)

    try:
        parsed_output = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenAI returned invalid JSON for receipt extraction.",
        ) from exc

    try:
        extracted_fields = ExtractedExpenseFields.validate_llm_output(parsed_output)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return _apply_fallbacks(extracted_fields, ocr_text)
