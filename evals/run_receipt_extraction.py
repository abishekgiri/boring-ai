from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.ai_extraction import extract_expense_fields  # noqa: E402


FIELDS = ("vendor", "amount", "date", "category")


@dataclass
class EvalCase:
    name: str
    input_path: Path
    expected_path: Path
    description: str


def load_cases() -> list[EvalCase]:
    manifest_path = REPO_ROOT / "evals" / "receipt_extraction_cases.json"
    raw_cases = json.loads(manifest_path.read_text())
    return [
        EvalCase(
            name=case["name"],
            input_path=REPO_ROOT / case["input_path"],
            expected_path=REPO_ROOT / case["expected_path"],
            description=case["description"],
        )
        for case in raw_cases
    ]


def normalize_value(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, float):
        return round(value, 2)
    return value


def run_case(case: EvalCase) -> dict[str, Any]:
    ocr_text = case.input_path.read_text()
    expected = json.loads(case.expected_path.read_text())
    actual = {
        key: normalize_value(value)
        for key, value in extract_expense_fields(ocr_text).model_dump().items()
    }

    field_results = {
        field: {
            "expected": expected.get(field),
            "actual": actual.get(field),
            "match": expected.get(field) == actual.get(field),
        }
        for field in FIELDS
    }

    return {
        "name": case.name,
        "description": case.description,
        "passed": all(item["match"] for item in field_results.values()),
        "field_results": field_results,
    }


def print_results(results: list[dict[str, Any]]) -> int:
    total_cases = len(results)
    passed_cases = sum(1 for result in results if result["passed"])
    total_field_checks = total_cases * len(FIELDS)
    passed_field_checks = sum(
        1
        for result in results
        for item in result["field_results"].values()
        if item["match"]
    )

    print("Receipt extraction evals")
    print("=======================")
    print()

    for result in results:
        status = "PASS" if result["passed"] else "FAIL"
        print(f"{status} {result['name']}")
        print(f"  {result['description']}")
        for field in FIELDS:
            item = result["field_results"][field]
            field_status = "ok" if item["match"] else "miss"
            print(
                f"  - {field}: {field_status} | expected={item['expected']!r} actual={item['actual']!r}"
            )
        print()

    print("Summary")
    print("-------")
    print(f"Cases passed: {passed_cases}/{total_cases}")
    print(
        f"Field accuracy: {passed_field_checks}/{total_field_checks} "
        f"({(passed_field_checks / total_field_checks) * 100:.1f}%)"
    )

    return 0 if passed_cases == total_cases else 1


def main() -> int:
    cases = load_cases()
    results = [run_case(case) for case in cases]
    return print_results(results)


if __name__ == "__main__":
    raise SystemExit(main())
