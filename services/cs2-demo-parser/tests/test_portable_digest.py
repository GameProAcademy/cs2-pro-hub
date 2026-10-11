"""Digests the APP recomputes must not depend on Python's float repr or key collation."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from raw_artifact import _es_number, _stable, _stable_portable

VECTOR = Path(__file__).parent / "fixtures" / "portable_digest_vector.json"
# Asserted with the same value by src/lib/pipeline/__tests__/rawArtifactPortableDigest.test.ts.
EXPECTED = "e1e49c02fecb4b31fd0ff0803c4ab04f64094498c752e163aaf98de7d2bda941"


def test_the_shared_vector_has_the_digest_the_app_computes():
    value = json.loads(VECTOR.read_text(encoding="utf-8"))
    assert hashlib.sha256(_stable_portable(value)).hexdigest() == EXPECTED


def test_a_float_that_json_carries_as_an_integer_is_written_as_one():
    # The defect: Python wrote 0.0, the APP re-serialized the parsed value as 0.
    assert _stable_portable({"coverage_ratio": 0.0}) == b'{"coverage_ratio":0}'
    assert _stable({"coverage_ratio": 0.0}) == b'{"coverage_ratio":0.0}'  # RAW lines keep repr


def test_keys_are_ordered_by_code_unit_not_by_collation():
    assert _stable_portable({"name": 1, "PlayerID": 2, "_x": 3}) == b'{"PlayerID":2,"_x":3,"name":1}'


def test_values_without_floats_are_byte_identical_to_the_previous_form():
    value = {"b": [1, "x", None, True], "a": {"z": "é\n", "Y": 2}, "s": "\"q\""}
    assert _stable_portable(value) == _stable(value)


@pytest.mark.parametrize("number, text", [
    (0.0, "0"), (-0.0, "0"), (1.0, "1"), (0.1, "0.1"), (-2.5, "-2.5"), (1e21, "1e+21"),
    (1e20, "100000000000000000000"), (1e-7, "1e-7"), (1e-6, "0.000001"), (123456789.125, "123456789.125"),
    (5e-324, "5e-324"), (1.7976931348623157e308, "1.7976931348623157e+308"), (0.30000000000000004, "0.30000000000000004"),
])
def test_numbers_are_written_as_ecmascript_prints_them(number, text):
    assert _es_number(number) == text


def test_non_finite_numbers_become_null_as_before():
    assert _stable_portable([float("nan"), float("inf")]) == b"[null,null]"
