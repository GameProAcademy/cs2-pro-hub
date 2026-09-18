"""Independent, read-only reconciliation of a persisted RAW manifest.

This module never talks to Storage or the database. Callers supply bytes already
read through an authorised server-only path; every decision is derived again.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from typing import Any

from raw_artifact import _stable
from raw_evidence import mapping_inventory

ALLOWED_MAPPING_STATUSES = frozenset({
    "MAPPED", "DERIVED", "RAW_ONLY_INTENTIONAL", "NOT_PRESENT_IN_DEMO",
    "UNAVAILABLE", "PARSE_FAILED", "UNMAPPED_BUT_AVAILABLE",
})


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label}_invalid")
    return value


def _mapping_rows(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    evidence = _object(manifest.get("audit_evidence"), "audit_evidence")
    rows = evidence.get("field_mappings")
    if not isinstance(rows, list) or not rows:
        raise ValueError("field_mappings_invalid")
    parsed: list[dict[str, Any]] = []
    for index, value in enumerate(rows):
        row = _object(value, f"field_mapping_{index}")
        raw_field = row.get("raw_field")
        status = row.get("status")
        if not isinstance(raw_field, str) or not raw_field.strip():
            raise ValueError(f"raw_field_invalid:{index}")
        if status not in ALLOWED_MAPPING_STATUSES:
            raise ValueError(f"mapping_status_invalid:{raw_field}:{status}")
        parsed.append(row)
    duplicates = sorted(name for name, count in Counter(row["raw_field"] for row in parsed).items() if count > 1)
    if duplicates:
        raise ValueError("duplicate_raw_fields:" + ",".join(duplicates))
    return parsed


def validate_manifest_identity(manifest: dict[str, Any], expected: dict[str, Any]) -> None:
    for key in ("job_id", "upload_id", "attempt_number", "demo_sha256", "root_digest"):
        if manifest.get(key) != expected.get(key):
            raise ValueError(f"manifest_identity_mismatch:{key}")
    if manifest.get("schema_version") != 1 or manifest.get("contract_version") != 1:
        raise ValueError("manifest_contract_invalid")
    if manifest.get("status") != "ready" or manifest.get("raw_status") != "ready":
        raise ValueError("manifest_not_ready")
    parser = _object(manifest.get("parser"), "parser")
    if parser.get("name") != "demoparser2" or parser.get("version") != "0.42.0":
        raise ValueError("parser_identity_invalid")


def validate_audit_digest(manifest: dict[str, Any]) -> str:
    evidence = _object(manifest.get("audit_evidence"), "audit_evidence")
    expected = manifest.get("audit_evidence_digest")
    actual = hashlib.sha256(_stable(evidence)).hexdigest()
    if not isinstance(expected, str) or len(expected) != 64 or actual != expected:
        raise ValueError("audit_evidence_digest_mismatch")
    return actual


def _raw_material(fields: list[str]) -> dict[str, Any]:
    raw: dict[str, Any] = {
        "header": {}, "players": [{}], "event_tables": {},
        "tick_rows": [{}], "grenade_rows": [{}], "round_rows": [{}],
    }
    for field in fields:
        family, separator, native = field.partition(".")
        if not separator or not native:
            raise ValueError(f"raw_field_family_invalid:{field}")
        if family == "header":
            raw["header"][native] = 1
        elif family == "player":
            raw["players"][0][native] = 1
        elif family == "game_state":
            raw["tick_rows"][0][native] = 1
        elif family == "grenade":
            raw["grenade_rows"][0][native] = 1
        elif family == "round":
            raw["round_rows"][0][native] = 1
        else:
            raw["event_tables"].setdefault(family, [{}])[0][native] = 1
    return raw


def reconcile_legacy_unmapped(manifest: dict[str, Any], fixture: dict[str, Any]) -> dict[str, Any]:
    """Compare the physical manifest corpus to the fixture and current code."""
    rows = _mapping_rows(manifest)
    actual = sorted(row["raw_field"] for row in rows if row["status"] == "UNMAPPED_BUT_AVAILABLE")
    fixture_fields = fixture.get("legacy_unmapped_fields")
    if not isinstance(fixture_fields, list) or not all(isinstance(field, str) and field for field in fixture_fields):
        raise ValueError("fixture_fields_invalid")
    fixture_duplicates = sorted(name for name, count in Counter(fixture_fields).items() if count > 1)
    if fixture_duplicates:
        raise ValueError("fixture_duplicate_raw_fields:" + ",".join(fixture_duplicates))
    projected = {row["raw_field"]: row for row in mapping_inventory(_raw_material(actual))}
    matrix = []
    for field in actual:
        legacy = next(row for row in rows if row["raw_field"] == field)
        current = projected.get(field)
        decision = (
            "PASS" if current is not None
            and current.get("status") in {"MAPPED", "DERIVED", "RAW_ONLY_INTENTIONAL"}
            and (current.get("status") != "RAW_ONLY_INTENTIONAL" or bool(str(current.get("reason") or "").strip()))
            else "FAIL"
        )
        matrix.append({
            "raw_field": field,
            "manifest_status": legacy["status"],
            "fixture_status": "LEGACY_UNMAPPED",
            "code_status": current.get("status") if current else None,
            "manifest_reason": legacy.get("reason"),
            "code_reason": current.get("reason") if current else None,
            "app_field": current.get("app_field") if current else None,
            "canonical_field": current.get("canonical_field") if current else None,
            "decision": decision,
            "evidence": "manifest.audit_evidence.field_mappings",
        })
    result = {
        "a_total": len(actual), "b_total": len(fixture_fields),
        "a_unique": len(set(actual)), "b_unique": len(set(fixture_fields)),
        "a_minus_b": sorted(set(actual) - set(fixture_fields)),
        "b_minus_a": sorted(set(fixture_fields) - set(actual)),
        "duplicates_a": [], "duplicates_b": fixture_duplicates,
        "current_counts": dict(sorted(Counter(row["code_status"] for row in matrix).items())),
        "matrix": matrix,
    }
    result["status"] = "PASS" if (
        result["a_unique"] == result["b_unique"] == 178
        and not result["a_minus_b"] and not result["b_minus_a"]
        and not result["duplicates_a"] and not result["duplicates_b"]
        and all(row["decision"] == "PASS" for row in matrix)
    ) else "FAIL"
    return result


def audit_manifest(manifest: dict[str, Any], fixture: dict[str, Any], expected: dict[str, Any]) -> dict[str, Any]:
    validate_manifest_identity(manifest, expected)
    digest = validate_audit_digest(manifest)
    reconciliation = reconcile_legacy_unmapped(manifest, fixture)
    return {"status": reconciliation["status"], "audit_evidence_digest": digest, **reconciliation}