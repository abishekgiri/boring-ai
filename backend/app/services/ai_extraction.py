from __future__ import annotations

import json
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
                "description": "The receipt date in YYYY-MM-DD format when known.",
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
                    "Use the most likely merchant name as vendor. "
                    "Use the final total amount paid as amount. "
                    "Convert dates to YYYY-MM-DD when possible. "
                    "Choose a simple business expense category."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Extract receipt fields from the OCR text below.\n\n"
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
        return ExtractedExpenseFields.validate_llm_output(parsed_output)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
