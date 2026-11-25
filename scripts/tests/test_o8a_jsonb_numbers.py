"""O8-A item 2: the harness prints jsonb numbers exactly as PostgreSQL does (no rounding, no tolerance)."""
import json
from pathlib import Path

import pytest

from scripts.canonical_v3 import harness

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / "docs/client-parser/canonical-demo-v3/o8a-jsonb-number-cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["json"][:24] for c in CASES])
def test_matches_postgresql_jsonb_text(case):
    # decimals, integers, negatives, -0, null, sub-1e-6, >=1e21, 2^53, min subnormal and max double
    assert harness.jsonb_text(json.loads(case["json"])) == case["postgres"]


def test_the_cases_cover_the_required_kinds():
    values = [json.loads(c["json"]) for c in CASES]
    assert None in values
    assert any(isinstance(v, int) and v < 0 for v in values)
    assert any(isinstance(v, float) and v < 0 and v != int(v) for v in values)
    assert any(isinstance(v, float) and 0 < abs(v) < 1e-6 for v in values)
    assert any(isinstance(v, (int, float)) and abs(v) >= 1e21 for v in values)


def test_nested_objects_and_arrays_keep_exact_numbers():
    value = {"detonation_position": {"x": -266.2624816894531, "y": 1410.2576904296875, "z": -26.929941177368164}}
    assert harness.jsonb_text(value) == (
        '{"detonation_position": {"x": -266.2624816894531, "y": 1410.2576904296875, "z": -26.929941177368164}}')
    assert harness.jsonb_text([1, 2.5, None, -0.0]) == "[1, 2.5, null, 0]"


def test_no_rounding_two_close_values_stay_different():
    a, b = 0.1234567, 0.1234568
    assert harness.jsonb_text(a) != harness.jsonb_text(b)
    assert harness.jsonb_text(0.30000000000000004) != harness.jsonb_text(0.3)


def test_non_finite_and_bool_are_refused():
    for bad in (float("nan"), float("inf"), float("-inf")):
        with pytest.raises(ValueError):
            harness.jsonb_number_text(bad)
    with pytest.raises(TypeError):
        harness.jsonb_number_text(True)


def test_scalar_numeric_columns_keep_their_documented_six_decimal_rule():
    # Columns compared through round(numeric, 6) in SQL are unchanged by O8-A (not jsonb).
    assert harness.canon(1.23456789) == "1.234568"
