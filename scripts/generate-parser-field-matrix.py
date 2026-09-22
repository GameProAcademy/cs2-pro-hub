#!/usr/bin/env python3
"""Generate the fail-closed Python/WASM field-governance matrix."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "services/cs2-demo-parser"
MANIFEST = ROOT / "docs/client-parser/upstream-surface-manifest.json"
OUTPUT = ROOT / "docs/client-parser/reconciled-field-matrix.json"
sys.path.insert(0, str(SERVICE))

from capability_catalog import CATALOG_VERSION, static_capabilities  # noqa: E402


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode()).hexdigest()


def build_matrix() -> dict[str, Any]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    wasm_by_name: dict[str, list[dict[str, Any]]] = {}
    for row in manifest["fields"]:
        wasm_by_name.setdefault(str(row["propertyName"]), []).append(row)

    rows: list[dict[str, Any]] = []
    matched_wasm: set[str] = set()
    for capability in static_capabilities():
        matches = wasm_by_name.get(capability.name, [])
        wasm_refs = []
        for match in matches:
            identity = f'{match["sourceApi"]}:{match["eventOrEntity"]}:{match["propertyName"]}'
            matched_wasm.add(identity)
            wasm_refs.append(identity)
        row = {
            "identity": capability.capability_id,
            "pythonCapabilityId": capability.capability_id,
            "wasmFieldIdentities": sorted(wasm_refs),
            "classification": capability.classification,
            "mappingStatus": capability.mapping_status,
            "appField": capability.app_field,
            "canonicalField": capability.canonical_field,
            "rawAllowed": capability.raw_allowed,
            "derivedAllowed": capability.derived_allowed,
            "canonicalAllowed": capability.canonical_allowed,
            "normalizationStatus": capability.normalization_status,
            "identityStatus": capability.identity_status,
            "tickRoundStatus": capability.tick_round_status,
            "parityStatus": capability.parity_status,
            "determinismStatus": capability.determinism_status,
            "evidenceStatus": capability.evidence_status,
            "reviewStatus": capability.review_status,
            "reason": capability.reason,
            "pythonEvidenceRef": capability.source_reference,
            "wasmEvidenceRefs": sorted({ref for match in matches for ref in match.get("evidenceRefs", [])}),
            "status": "RECONCILED" if matches else "PYTHON_ONLY_REVIEWED",
        }
        row["digest"] = digest(row)
        rows.append(row)

    for wasm in manifest["fields"]:
        identity = f'{wasm["sourceApi"]}:{wasm["eventOrEntity"]}:{wasm["propertyName"]}'
        if identity in matched_wasm:
            continue
        row = {
            "identity": f"wasm.{identity}",
            "pythonCapabilityId": None,
            "wasmFieldIdentities": [identity],
            "classification": "UNAVAILABLE",
            "mappingStatus": "WASM_ONLY_UNRECONCILED",
            "appField": None,
            "canonicalField": None,
            "rawAllowed": True,
            "derivedAllowed": False,
            "canonicalAllowed": False,
            "normalizationStatus": "NOT_RUN",
            "identityStatus": "NOT_RUN",
            "tickRoundStatus": "NOT_RUN",
            "parityStatus": "NOT_RUN",
            "determinismStatus": "NOT_RUN",
            "evidenceStatus": "UPSTREAM_SOURCE_ONLY",
            "reviewStatus": "REVIEW_REQUIRED",
            "reason": "WASM field has no exact Python catalog identity; no inferred mapping is allowed.",
            "pythonEvidenceRef": None,
            "wasmEvidenceRefs": sorted(wasm.get("evidenceRefs", [])),
            "status": "BLOCKED",
        }
        row["digest"] = digest(row)
        rows.append(row)

    rows.sort(key=lambda row: row["identity"])
    summary = {
        "total": len(rows),
        "reconciled": sum(row["status"] == "RECONCILED" for row in rows),
        "pythonOnlyReviewed": sum(row["status"] == "PYTHON_ONLY_REVIEWED" for row in rows),
        "blocked": sum(row["status"] == "BLOCKED" for row in rows),
        "canonicalAllowed": sum(row["canonicalAllowed"] is True for row in rows),
    }
    payload = {
        "schemaVersion": 1,
        "pythonCatalogVersion": CATALOG_VERSION,
        "wasmCatalogVersion": manifest["catalogVersion"],
        "wasmContractVersion": manifest["contractVersion"],
        "status": "PASS" if summary["blocked"] == 0 else "BLOCKED",
        "summary": summary,
        "rows": rows,
    }
    return {**payload, "digest": digest(payload)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(build_matrix(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != rendered:
            print("reconciled field matrix is stale", file=sys.stderr)
            return 1
        return 0
    OUTPUT.write_text(rendered, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())