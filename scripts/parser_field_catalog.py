#!/usr/bin/env python3
"""Parser field catalog: generate, audit (CI) and diagnose.

Single source of truth for a field's CLASS: services/cs2-demo-parser/raw_evidence.py (the worker
code that is attested and pinned). This tool never classifies anything by itself:

  generate  Rebuild docs/reference/parser_field_catalog.json from the worker tables plus the
            review records in docs/reference/parser_field_reviews.json.
  check     CI audit. Fails when the committed catalog drifts from the worker code, when a class
            has no review record, when a review record points at nothing, when a field is in two
            classes, or when the classification test that proves non-consumption is missing.
  diagnose  Read a RAW artifact manifest (raw_evidence_artifacts.manifest_storage_path for a
            job + attempt) and report every UNMAPPED field: event, field, observed type, rows,
            parser revision and the gates it blocked. Read-only; prints no event values.

Classes (docs/PARSER_FIELD_GOVERNANCE.md):
  CANONICAL         MAPPED / DERIVED: feeds Canonical data; has app + canonical targets.
  RAW_ONLY          preserved RAW evidence, never consumed downstream.
  IGNORED_APPROVED  reviewed, intentionally unused; preserved; never blocks.
  UNMAPPED          anything else: blocks RAW-EVIDENCE-01 and RAW->CANONICAL.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "services" / "cs2-demo-parser"
CATALOG = ROOT / "docs" / "reference" / "parser_field_catalog.json"
REVIEWS = ROOT / "docs" / "reference" / "parser_field_reviews.json"
GOVERNANCE_TEST = WORKER / "tests" / "test_field_governance.py"
CATALOG_SCHEMA = 1


def _worker():
    sys.path.insert(0, str(WORKER))
    import raw_evidence  # noqa: PLC0415 - imported from the worker tree on purpose

    return raw_evidence


def _git_blob(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def worker_classes() -> dict[str, dict[str, Any]]:
    """Every explicitly classified field, keyed by '<family>.<field>' (or '<event>.*' rules)."""
    r = _worker()
    out: dict[str, dict[str, Any]] = {}

    def put(key: str, entry: dict[str, Any]) -> None:
        if key in out:
            raise SystemExit(f"field classified twice: {key}")
        out[key] = entry

    for key, (app, canonical, status) in sorted(r.MAPPED_RAW_FIELDS.items()):
        put(key, {"class": "CANONICAL", "status": status, "app_field": app, "canonical_field": canonical})
    for event, fields in sorted(r.REVIEWED_RAW_ONLY_EVENT_FIELDS.items()):
        for field in sorted(fields):
            key = f"{event}.{field}"
            if key not in out:
                put(key, {"class": "RAW_ONLY", "status": "RAW_ONLY_INTENTIONAL"})
    for event, fields in sorted(r.REVIEWED_IGNORED_EVENT_FIELDS.items()):
        for field in sorted(fields):
            put(f"{event}.{field}", {"class": "IGNORED_APPROVED", "status": "RAW_ONLY_INTENTIONAL"})
    rules = {
        "player.<PLAYER_PROPERTIES>": sorted(r.PLAYER_PROPERTIES),
        "game_state.<PLAYER_PROPERTIES>": sorted(r.PLAYER_PROPERTIES),
        "<EVENT_CANDIDATES>.<REVIEWED_EVENT_FIELDS>": sorted(r.REVIEWED_EVENT_FIELDS),
        "header.<REVIEWED_HEADER_FIELDS>": sorted(r.REVIEWED_HEADER_FIELDS),
        "grenade.<REVIEWED_GRENADE_FIELDS>": sorted(r.REVIEWED_GRENADE_FIELDS),
    }
    for rule, fields in rules.items():
        put(rule, {"class": "RAW_ONLY", "status": "RAW_ONLY_INTENTIONAL", "fields": fields,
                   "note": "family rule; any explicit CANONICAL entry above takes precedence"})
    return out


def _review_for(key: str, reviews: dict[str, Any]) -> dict[str, Any] | None:
    if key in reviews["fields"]:
        return reviews["fields"][key]
    family = key.split(".", 1)[0]
    return reviews["events"].get(family) or reviews["rules"].get(key)


def build_catalog() -> dict[str, Any]:
    reviews = json.loads(REVIEWS.read_text(encoding="utf-8"))
    classes = worker_classes()
    entries = []
    for key, entry in sorted(classes.items()):
        review = _review_for(key, reviews)
        entries.append({"field": key, **entry, "review": review})
    counts: dict[str, int] = {}
    for entry in entries:
        counts[entry["class"]] = counts.get(entry["class"], 0) + 1
    body = {
        "schema": CATALOG_SCHEMA,
        "source_of_truth": "services/cs2-demo-parser/raw_evidence.py",
        "source_blob": _git_blob(WORKER / "raw_evidence.py"),
        "classes": ["CANONICAL", "RAW_ONLY", "IGNORED_APPROVED", "UNMAPPED"],
        "unmapped_rule": "any observed field not listed here is UNMAPPED_BUT_AVAILABLE and blocks admission",
        "counts": dict(sorted(counts.items())),
        "entries": entries,
    }
    body["digest"] = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return body


def render(catalog: dict[str, Any]) -> str:
    return json.dumps(catalog, indent=1, sort_keys=True, ensure_ascii=False) + "\n"


def check() -> list[str]:
    problems: list[str] = []
    reviews = json.loads(REVIEWS.read_text(encoding="utf-8"))
    try:
        fresh = build_catalog()
    except SystemExit as exc:  # a field in two classes
        return [str(exc)]
    if not CATALOG.exists():
        problems.append("catalog_missing: run scripts/parser_field_catalog.py generate")
    elif CATALOG.read_text(encoding="utf-8") != render(fresh):
        problems.append("catalog_drift: committed catalog differs from the worker code; regenerate and review")
    for entry in fresh["entries"]:
        review = entry["review"]
        if not review:
            problems.append(f"review_missing:{entry['field']}")
            continue
        for key in ("reason", "reviewed", "introduced_in", "tests"):
            if not review.get(key):
                problems.append(f"review_incomplete:{entry['field']}:{key}")
        if entry["class"] == "CANONICAL" and not (entry.get("app_field") and entry.get("canonical_field")):
            problems.append(f"canonical_without_targets:{entry['field']}")
    known = {entry["field"] for entry in fresh["entries"]}
    known_events = {key.split(".", 1)[0] for key in known}
    for key in reviews["fields"]:
        if key not in known:
            problems.append(f"orphan_review_field:{key}")
    for event in reviews["events"]:
        if event not in known_events:
            problems.append(f"orphan_review_event:{event}")
    test_source = GOVERNANCE_TEST.read_text(encoding="utf-8") if GOVERNANCE_TEST.exists() else ""
    for required in (
        "test_every_field_the_adapter_reads_is_canonical",
        "test_no_raw_only_or_ignored_field_changes_the_adapter_output",
        "test_raw_only_game_state_never_reaches_the_hot_payload",
        "test_unknown_fields_and_unknown_events_still_block",
        "test_ever_fully_connected_is_raw_only_preserved_and_never_consumed",
    ):
        if f"def {required}(" not in test_source:
            problems.append(f"governance_test_missing:{required}")
    return problems


def diagnose(manifest: dict[str, Any]) -> dict[str, Any]:
    audit = manifest.get("audit_evidence") or {}
    mappings = audit.get("field_mappings") or []
    contract = audit.get("forensic_contract_v2") or {}
    events = {row.get("event_name"): row for row in contract.get("event_inventory") or [] if isinstance(row, dict)}
    unmapped = []
    for row in mappings:
        if row.get("status") != "UNMAPPED_BUT_AVAILABLE":
            continue
        field = str(row.get("raw_field"))
        family, native = (field.split(".", 1) + [""])[:2]
        event = events.get(family) or {}
        types = (event.get("native_types") or {}).get(native)
        unmapped.append({
            "field": field,
            "event": family,
            "native_field": native,
            "kind": "new_event" if native == "__event__" else "new_field",
            "observed_types": types,
            "event_rows": event.get("row_count"),
            "first_tick": event.get("first_tick"),
            "last_tick": event.get("last_tick"),
        })
    # A field observed with more than one native type in the same demo is reported, never coerced.
    type_conflicts = sorted(
        f"{name}.{field}"
        for name, row in events.items()
        for field, types in (row.get("native_types") or {}).items()
        if isinstance(types, list) and len(set(types) - {"null"}) > 1
    )
    gates = [g for g in contract.get("gates") or [] if isinstance(g, dict) and g.get("status") != "PASS"]
    return {
        "job_id": manifest.get("job_id"),
        "attempt": manifest.get("attempt_number"),
        "raw_status": manifest.get("raw_status"),
        "audit_status": manifest.get("audit_status"),
        "parser": manifest.get("parser"),
        "raw_block_reasons": manifest.get("raw_block_reasons"),
        "unmapped": unmapped,
        "type_conflicts": type_conflicts,
        "blocking_admission_gates": [r for r in (manifest.get("raw_block_reasons") or []) if str(r).startswith("gate:")],
        "non_pass_v2_gates": [g.get("gate") for g in gates],
        "next_step": "docs/PARSER_FIELD_GOVERNANCE.md#runbook" if unmapped else None,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("generate")
    sub.add_parser("check")
    d = sub.add_parser("diagnose")
    d.add_argument("manifest", type=Path)
    args = parser.parse_args(argv)
    if args.command == "generate":
        CATALOG.write_text(render(build_catalog()), encoding="utf-8")
        print(f"wrote {CATALOG.relative_to(ROOT)}")
        return 0
    if args.command == "check":
        problems = check()
        for problem in problems:
            print(f"::error title=parser field catalog::{problem}")
        print("parser field catalog: PASS" if not problems else f"parser field catalog: FAIL ({len(problems)})")
        return 1 if problems else 0
    report = diagnose(json.loads(args.manifest.read_text(encoding="utf-8")))
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
