"""A9.1 canonical parity contract v1 — Python implementation.

This module and canonical_schema.mjs implement the SAME contract
(canonical/contract.json) and are verified against the SAME vectors
(canonical/vectors.json). Any change here must change the contract version and
both implementations together. Laboratory tooling only: it carries no
Canonical, Attempt 9 or production authority.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

_CONTRACT_PATH = Path(__file__).resolve().parent / "canonical" / "contract.json"
CONTRACT = json.loads(_CONTRACT_PATH.read_text(encoding="utf-8"))
CANONICAL_CONTRACT_VERSION = CONTRACT["canonicalContractVersion"]
CANONICAL_CONTRACT_DIGEST = hashlib.sha256(_CONTRACT_PATH.read_bytes()).hexdigest()

_MAX_SAFE = 2**53 - 1
_MAX_U64 = 2**64 - 1
_U64_TEXT = re.compile(r"(?:0|[1-9][0-9]{0,19})\Z")
_NULL_LINE = "null"
_SHORT_ESCAPES = {
    '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t",
}


class CanonicalError(ValueError):
    def __init__(self, code: str, field: str | None = None):
        super().__init__(f"A91_CANONICAL_{code}" + (f":{field}" if field else ""))
        self.code = code
        self.field = field


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_u64_field(field: Any) -> bool:
    if not isinstance(field, str):
        return False
    spec = CONTRACT["u64DecimalFields"]
    return field in spec["exact"] or any(field.endswith(item) for item in spec["suffix"])


def canonical_string(value: Any, field: str | None = None) -> str:
    """RFC 8785 string serialization; lone surrogates fail closed."""
    if not isinstance(value, str):
        raise CanonicalError("STRING_EXPECTED", field)
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        raise CanonicalError("LONE_SURROGATE", field) from None
    out = ['"']
    for char in value:
        escaped = _SHORT_ESCAPES.get(char)
        if escaped is not None:
            out.append(escaped)
        elif char < " ":
            out.append(f"\\u{ord(char):04x}")
        else:
            out.append(char)
    out.append('"')
    return "".join(out)


def ecmascript_number(number: float) -> str:
    """ECMAScript Number::toString for a finite double (RFC 8785 3.2.2.3)."""
    if not math.isfinite(number):
        raise CanonicalError("NON_FINITE_NUMBER")
    if number == 0:
        return "0"  # Includes negative zero, as JSON.stringify does.
    negative = number < 0
    raw = repr(abs(number)).lower()
    mantissa, exponent = (raw.split("e", 1) + ["0"])[:2] if "e" in raw else (raw, "0")
    exponent_value = int(exponent)
    whole, _, fraction = mantissa.partition(".")
    digits = whole + fraction
    decimal_position = len(whole) + exponent_value
    while len(digits) > 1 and digits.startswith("0"):
        digits = digits[1:]
        decimal_position -= 1
    while len(digits) > 1 and digits.endswith("0"):
        digits = digits[:-1]
    if 0 < decimal_position <= 21:
        if decimal_position >= len(digits):
            result = digits + "0" * (decimal_position - len(digits))
        else:
            result = digits[:decimal_position] + "." + digits[decimal_position:]
    elif -6 < decimal_position <= 0:
        result = "0." + "0" * (-decimal_position) + digits
    else:
        exp = decimal_position - 1
        result = digits[0] + ("." + digits[1:] if len(digits) > 1 else "")
        result += "e" + ("+" if exp >= 0 else "-") + str(abs(exp))
    return ("-" if negative else "") + result


def _utf16_key(key: str) -> bytes:
    return key.encode("utf-16-be", "surrogatepass")


def _u64_text(value: Any, field: str | None) -> str:
    if isinstance(value, bool):
        raise CanonicalError("U64_INVALID", field)
    if isinstance(value, int):
        text = str(value)
    elif isinstance(value, str):
        text = value
    else:
        raise CanonicalError("U64_PRECISION_LOST", field)
    if not _U64_TEXT.match(text) or int(text) > _MAX_U64:
        raise CanonicalError("U64_INVALID", field)
    return text


def canonicalize_value(value: Any, field: str | None = None, observed: dict | None = None) -> tuple[str, str]:
    """Return (canonical JSON text, value class) for one value."""
    if value is None or type(value).__name__ in {"NAType", "NaTType"}:
        return "null", "null"
    if not isinstance(value, (str, bool, int, float, list, tuple, dict)):
        tolist = getattr(value, "tolist", None)  # numpy scalars and arrays
        if callable(tolist):
            value = tolist()
        else:
            raise CanonicalError("UNSUPPORTED_TYPE", field)
        if value is None:
            return "null", "null"
    if isinstance(value, float) and not math.isfinite(value):
        if observed is not None:
            observed["nonFinite"] = observed.get("nonFinite", 0) + 1
        return "null", "null"
    if is_u64_field(field) and not isinstance(value, (list, tuple, dict)):
        return json.dumps(_u64_text(value, field)), "u64"
    if isinstance(value, bool):
        return ("true" if value else "false"), "bool"
    if isinstance(value, int):
        if abs(value) > _MAX_SAFE:
            raise CanonicalError("UNREGISTERED_BIG_INTEGER", field)
        return str(value), "integer"
    if isinstance(value, float):
        if value.is_integer():
            if abs(value) > _MAX_SAFE:
                return ecmascript_number(value), "float"
            return str(int(value)), "integer"
        return ecmascript_number(value), "float"
    if isinstance(value, str):
        return canonical_string(value, field), "string"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonicalize_value(item, field, observed)[0] for item in value) + "]", "array"
    if isinstance(value, dict):
        parts = []
        for key, item in value.items():
            if not isinstance(key, str):
                raise CanonicalError("NON_STRING_KEY", field)
            parts.append((key, canonicalize_value(item, key, observed)[0]))
        parts.sort(key=lambda pair: _utf16_key(pair[0]))
        return "{" + ",".join(f"{canonical_string(key, field)}:{text}" for key, text in parts) + "}", "object"
    raise CanonicalError("UNSUPPORTED_TYPE", field)


def canonical_text(value: Any, field: str | None = None) -> str:
    return canonicalize_value(value, field)[0]


def canonical_digest(value: Any, field: str | None = None) -> str:
    return _sha256(canonical_text(value, field))


def _empty_classes() -> dict[str, int]:
    return {name: 0 for name in CONTRACT["valueClasses"]}


def _safe_integer(value: Any) -> int | None:
    """Entity ids arrive as Python or numpy integers (or integral floats)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    try:
        if float(value) != number:
            return None
    except (TypeError, ValueError, OverflowError):
        return None
    return number if abs(number) <= 2**53 - 1 else None


class TableAccumulator:
    """Streaming, bounded-memory table summary (see canonical_schema.mjs)."""

    def __init__(self, name: str, block_rows: int | None = None, sample_rows: int | None = None):
        self.name = name
        self.block_rows = block_rows or CONTRACT["blockRows"]
        self.sample_rows = CONTRACT["sampleRows"] if sample_rows is None else sample_rows
        self.breakdown_fields = list(CONTRACT["categoricalBreakdown"].get(name, []))
        self.row_count = 0
        self.columns: dict[str, dict[str, Any]] = {}
        self.row_hashes: list[str] = []
        self.row_block_digests: list[str] = []
        self.multiset = 0
        self.samples: list[dict[str, Any]] = []
        self.observed = {"absent": 0, "nonFinite": 0}
        self.breakdown: dict[str, dict[str, int]] = {field: {} for field in self.breakdown_fields}
        self.row_filter = CONTRACT.get("domainRowFilters", {}).get(name)
        self.excluded: dict[str, int] = {}
        self.excluded_count = 0
        # Rule R13 layer 3: evidence that an excluded row is the known anomaly.
        self.domain_entity_ids: set[int] = set()
        self.unclassified: dict[str, int] = {}
        self.unclassified_count = 0
        self.unexplained_count = 0
        self.finished = False

    def _admit(self, row: dict[str, Any]) -> bool:
        """Rule R13: True when the row belongs to the domain; excluded rows are counted."""
        row_filter = self.row_filter
        if not row_filter:
            return True
        value = row.get(row_filter["field"])
        if not isinstance(value, str):
            raise CanonicalError("DOMAIN_FILTER_FIELD_INVALID", self.name)
        entity_id = _safe_integer(row.get(row_filter["entityIdField"]))
        if any(part in value for part in row_filter["includeAnySubstring"]) and not any(
            part in value for part in row_filter["excludeAnySubstring"]
        ):
            if entity_id is not None:
                self.domain_entity_ids.add(entity_id)
            return True
        # Outside the domain: accepted only as the documented anomaly.
        if entity_id is None:
            raise CanonicalError("DOMAIN_FILTER_ENTITY_ID_INVALID", self.name)
        anomaly = row_filter["knownAnomaly"]
        known_class = value in anomaly["classExact"] or any(
            value.startswith(prefix) for prefix in anomaly["classPrefixes"]
        )
        if not known_class:
            self.unclassified[value] = self.unclassified.get(value, 0) + 1
            self.unclassified_count += 1
        if anomaly["requirePriorDomainRowForEntityId"] and entity_id not in self.domain_entity_ids:
            self.unexplained_count += 1
        self.excluded[value] = self.excluded.get(value, 0) + 1
        self.excluded_count += 1
        if len(self.excluded) > CONTRACT["maxCategoricalValues"]:
            raise CanonicalError("CATEGORICAL_OVERFLOW", row_filter["field"])
        return False

    def _column(self, field: str) -> dict[str, Any]:
        column = self.columns.get(field)
        if column is None:
            in_block = self.row_count % self.block_rows
            column = {
                "classes": _empty_classes(),
                "cells": [_NULL_LINE] * in_block,
                "blockDigests": [None] * len(self.row_block_digests),
            }
            # Rows seen before this field first appeared count as null (rule R8).
            column["classes"]["null"] += self.row_count
            self.observed["absent"] += self.row_count
            self.columns[field] = column
        return column

    def add_row(self, row: Any) -> None:
        if self.finished:
            raise CanonicalError("TABLE_FINISHED", self.name)
        if not isinstance(row, dict):
            raise CanonicalError("ROW_SHAPE_INVALID", self.name)
        if not self._admit(row):
            return
        seen = set()
        parts = []
        sample = {} if len(self.samples) < self.sample_rows else None
        for field, value in row.items():
            if not isinstance(field, str):
                raise CanonicalError("NON_STRING_KEY", self.name)
            seen.add(field)
            text, cls = canonicalize_value(value, field, self.observed)
            column = self._column(field)
            column["classes"][cls] += 1
            column["cells"].append(text)
            if cls != "null":
                parts.append((field, text))
            if sample is not None:
                sample[field] = json.loads(text)
            counts = self.breakdown.get(field)
            if counts is not None:
                key = "\u0000null" if cls == "null" else value if cls == "string" else text
                counts[key] = counts.get(key, 0) + 1
                if len(counts) > CONTRACT["maxCategoricalValues"]:
                    raise CanonicalError("CATEGORICAL_OVERFLOW", field)
        for field, column in self.columns.items():
            if field in seen:
                continue
            column["classes"]["null"] += 1
            column["cells"].append(_NULL_LINE)
            self.observed["absent"] += 1
        parts.sort(key=lambda pair: _utf16_key(pair[0]))
        row_hash = _sha256("{" + ",".join(f"{canonical_string(field)}:{text}" for field, text in parts) + "}")
        self.row_hashes.append(row_hash)
        self.multiset = (self.multiset + int(row_hash, 16)) % (1 << 256)
        if sample is not None:
            self.samples.append(sample)
        self.row_count += 1
        if self.row_count % self.block_rows == 0:
            self._flush()

    def _flush(self) -> None:
        if not self.row_hashes:
            return
        self.row_block_digests.append(_sha256("".join(self.row_hashes)))
        self.row_hashes = []
        for column in self.columns.values():
            column["blockDigests"].append(_sha256("\n".join(column["cells"])))
            column["cells"] = []

    def finish(self) -> dict[str, Any]:
        if self.finished:
            raise CanonicalError("TABLE_FINISHED", self.name)
        self._flush()
        self.finished = True
        all_null_block = _sha256("\n".join([_NULL_LINE] * self.block_rows))
        fields = sorted(self.columns, key=_utf16_key)
        columns = {}
        column_block_digests = {}
        for field in fields:
            column = self.columns[field]
            blocks = [value if value is not None else all_null_block for value in column["blockDigests"]]
            column_block_digests[field] = blocks
            columns[field] = {"digest": _sha256("".join(blocks)), "classes": column["classes"]}
        summary: dict[str, Any] = {
            "canonicalContractVersion": CANONICAL_CONTRACT_VERSION,
            "table": self.name,
            "rowCount": self.row_count,
            "fields": fields,
            "tableDigest": _sha256("".join(self.row_block_digests)),
            "multisetDigest": format(self.multiset, "064x"),
            "columns": columns,
        }
        if self.row_filter:
            # Semantic on purpose: a violated filter must change the digest and is
            # read by the comparator, which blocks the domain. Status only.
            summary["domainFilter"] = {
                "rule": "R13_DOMAIN_ROW_FILTER",
                "status": "VIOLATED" if self.unclassified_count or self.unexplained_count else "CLEAN",
            }
        if self.breakdown_fields:
            summary["breakdown"] = {
                field: {
                    ("null" if key == "\u0000null" else key): count
                    for key, count in sorted(self.breakdown[field].items(), key=lambda pair: _utf16_key(pair[0]))
                }
                for field in self.breakdown_fields
            }
        return {
            "summary": summary,
            # Private diagnostics: never part of semantic digests or public reports.
            "diagnostics": {
                "blockRows": self.block_rows,
                "rowBlockDigests": self.row_block_digests,
                "columnBlockDigests": column_block_digests,
                "samples": self.samples,
                "observed": self.observed,
                # Rule R13: counts only (parser class names), published by the parity report.
                "exclusions": {
                    "rule": "R13_DOMAIN_ROW_FILTER",
                    "field": self.row_filter["field"],
                    "rawRowCount": self.row_count + self.excluded_count,
                    "count": self.excluded_count,
                    "byValue": dict(sorted(self.excluded.items())),
                    "unclassifiedClassRows": self.unclassified_count,
                    "unclassifiedByValue": dict(sorted(self.unclassified.items())),
                    "unexplainedRows": self.unexplained_count,
                }
                if self.row_filter
                else None,
            },
        }


def summarize_rows(name: str, rows: Any, **options: Any) -> dict[str, Any]:
    accumulator = TableAccumulator(name, **options)
    for row in rows:
        accumulator.add_row(row)
    return accumulator.finish()
