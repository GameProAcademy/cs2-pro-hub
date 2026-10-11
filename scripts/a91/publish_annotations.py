#!/usr/bin/env python3
"""Publish the bounded A9.1 decision as GitHub check annotations.

The sealed public reports are uploaded as artifacts, but artifacts and logs are
not always reachable for whoever has to audit a run. Annotations are part of
the check run itself. This script emits at most ten `::notice` lines, each a
compact JSON projection of ALREADY PUBLIC report fields.

Nothing private can pass: every value goes through `safe()`, which keeps only
booleans, null, bounded integers/floats and short strings made of a fixed
character set (statuses, reason codes, class names, hex digests). Anything
else becomes the literal "<withheld>". No URL, path, token or free text survives.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SAFE_TEXT = re.compile(r"^[A-Za-z0-9_.:+\-]{0,96}$")
MAX_NOTICE_BYTES = 3500
MAX_NOTICES = 10


def safe(value, depth: int = 0):
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value if abs(value) <= 2**53 else "<withheld>"
    if isinstance(value, float):
        return round(value, 3) if value == value and abs(value) != float("inf") else "<withheld>"
    if isinstance(value, str):
        return value if SAFE_TEXT.fullmatch(value) else "<withheld>"
    if depth >= 6:
        return "<withheld>"
    if isinstance(value, list):
        return [safe(item, depth + 1) for item in value[:64]]
    if isinstance(value, dict):
        return {key: safe(item, depth + 1) for key, item in list(value.items())[:64]
                if isinstance(key, str) and SAFE_TEXT.fullmatch(key)}
    return "<withheld>"


def pick(source, *keys):
    return {key: source.get(key) for key in keys if isinstance(source, dict) and key in source}


def load(directory: Path, name: str):
    try:
        value = json.loads((directory / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def real_gate(directory: Path) -> list[tuple[str, object]]:
    notices: list[tuple[str, object]] = []
    report = load(directory, "a91_real_dem_report.json")
    parity = load(directory, "parity_report.json")
    determinism = load(directory, "determinism_report.json")
    notices.append(("A91 decision", pick(report or {}, "status", "reason", "stage", "failedStage", "lastChildStage",
                                         "childExitStatus", "childSignal", "test_fixture_only", "canonicalEligible",
                                         "canonicalAuthorization", "attempt9Authorization", "productionAuthorization",
                                         "trapDetail", "errorName", "wasmMemoryBytesBefore", "wasmMemoryBytesAfter",
                                         "wasmProbe") if report else {"report": "MISSING"}))
    if report:
        fixture = report.get("fixture") or {}
        notices.append(("A91 demo identity", {**pick(fixture, "sizeBytes", "sha256", "authorizationRef"),
                                              "parser": report.get("parser"), "wasmArtifact": report.get("wasmArtifact")}))
        runs = report.get("runs") or {}
        notices.append(("A91 runs", {
            runtime: [pick(run, "status", "normalizedDigest", "durationMs") for run in (runs.get(runtime) or [])]
            for runtime in ("python", "wasm")}))
        notices.append(("A91 wasm memory", [run.get("wasmMemory") for run in (runs.get("wasm") or [])]))
        notices.append(("A91 determinism", report.get("determinism")))
    if determinism:
        notices.append(("A91 determinism report", pick(determinism, "status", "reason", "pythonDeterministic",
                                                       "wasmDeterministic", "identityStable")))
    if parity:
        diagnostics = parity.get("field_diagnostics") or {}
        notices.append(("A91 parity summary", {
            **pick(parity, "schema_version", "status", "comparablePassCount", "comparableFailCount",
                   "notComparableCount", "blockedCount", "notRunCount", "crossRuntimeComparableFieldCount",
                   "crossRuntimeComparableFieldPassCount"),
            **pick(diagnostics, "table_count", "table_pass_count", "table_fail_count", "empty_in_both_table_count",
                   "field_count", "field_pass_count", "first_divergence"),
            "canonical_contract_equal": (diagnostics.get("canonical_contract") or {}).get("equal"),
            "envelope_symmetric": (diagnostics.get("envelope_symmetry") or {}).get("symmetric"),
            "structure_symmetric": (diagnostics.get("structural_symmetry") or {}).get("symmetric"),
        }))
        notices.append(("A91 parity domains", {
            str(item.get("field")): [item.get("status"), item.get("mismatch_reason")]
            for item in (parity.get("comparisons") or []) if isinstance(item, dict)}))
        notices.append(("A91 diverging tables", [
            pick(table, "table", "status", "divergence_classes", "python_row_count", "wasm_row_count",
                 "field_count", "field_pass_count")
            for table in (diagnostics.get("tables") or [])
            if isinstance(table, dict) and table.get("status") != "PASS"][:12]))
        notices.append(("A91 raw output", parity.get("raw_output_diagnostics", "NOT_IN_THIS_CONTRACT_VERSION")))
    return notices


def public_fixture(directory: Path) -> list[tuple[str, object]]:
    report = load(directory, "a91_public_fixture_report.json")
    if not report:
        return [("A91 public fixture", {"report": "MISSING"})]
    checks = report.get("checks") or []
    return [
        ("A91 public fixture", pick(report, "status", "failedChecks", "test_fixture_only", "proves_real_demo",
                                    "wallClockSeconds", "wasmMemoryByApi", "wasmArtifact")),
        ("A91 public fixture checks", {str(item.get("name")): item.get("status") for item in checks if isinstance(item, dict)}),
        ("A91 public fixture parity", {key: value for key, value in (report.get("parity") or {}).items()
                                       if key != "rawOutputDiagnostics"}),
        ("A91 public fixture raw output", (report.get("parity") or {}).get("rawOutputDiagnostics", "NOT_IN_THIS_CONTRACT_VERSION")),
        ("A91 public fixture determinism", report.get("determinism")),
    ]


def emit(notices: list[tuple[str, object]]) -> list[str]:
    lines = []
    for title, value in notices[:MAX_NOTICES]:
        text = json.dumps(safe(value), sort_keys=True, separators=(",", ":"))
        if len(text.encode()) > MAX_NOTICE_BYTES:
            text = json.dumps({"truncated": True, "bytes": len(text.encode())}, separators=(",", ":"))
        lines.append(f"::notice title={title}::{text}")
    return lines


def main(argv: list[str]) -> int:
    if len(argv) != 3 or argv[1] not in ("real", "public-fixture"):
        print("usage: publish_annotations.py real|public-fixture <directory>", file=sys.stderr)
        return 2
    directory = Path(argv[2])
    notices = real_gate(directory) if argv[1] == "real" else public_fixture(directory)
    for line in emit(notices):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
