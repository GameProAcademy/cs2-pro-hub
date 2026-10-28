"""canonical-demo-v3 gate: per path, every field terminal AND its state's evidence present and holding.

Evidence files (docs/client-parser/canonical-demo-v3/evidence/server-*.json) are produced by
scripts/canonical_v3/harness.py and hold only counts, digests and check results (no demo data).
The gate never edits a classification: a missing or failing piece of evidence blocks the field.

Server requirements:
  available            -> every semantic check passes in every evidence demo; deterministic in every demo
                          with two runs (and at least MIN_DETERMINISM_DEMOS of them); non-null in at least one
                          demo; persistence round trip EQUAL in at least one demo and DIFFERENT in none
                          (fields with a documented exclusion are exempt from the round trip only).
  representation states-> the declared representation holds in every demo and no round trip is DIFFERENT.
Browser requirements:
  not_authorized       -> every policy marker below is present in the code it names.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from scripts.canonical_mapping_gate import FIELD_SPECS
from scripts.canonical_v3.contract import CONTRACT_VERSION, REPRESENTATION_STATES, STATES, build_contract

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_DIR = ROOT / "docs/client-parser/canonical-demo-v3/evidence"
MIN_EVIDENCE_DEMOS = 2
MIN_DETERMINISM_DEMOS = 2
BROWSER_MARKERS = {
    "src/lib/client-parser/clientParser.service.ts": 'if (import.meta.env.PROD) throw new ClientParserError("CLIENT_PARSER_UNAVAILABLE");',
    "src/lib/appDataContracts.ts": "canonicalAuthorization: z.literal(false),",
    "src/lib/client-parser/clientParser.validator.server.ts": 'return { accepted: false, canonicalAdmission: "BLOCKED", persisted: false, reasonCode };',
}


def load_evidence(directory: Path = EVIDENCE_DIR) -> list[dict[str, Any]]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("server-*.json"))]


def evaluate_server(contract: dict, evidence: list[dict]) -> dict[str, Any]:
    blockers: dict[str, list[str]] = {}
    if len(evidence) < MIN_EVIDENCE_DEMOS:
        blockers["*"] = [f"evidence demos {len(evidence)} < {MIN_EVIDENCE_DEMOS}"]
    for field in contract["fields"]:
        fid, state = field["id"], field["paths"]["server"]["state"]
        why: list[str] = []
        if not STATES[state]["terminal"]:
            why.append(f"non-terminal state {state}")
        items = [(e["label"], e["fields"].get(fid)) for e in evidence]
        if any(item is None for _, item in items):
            why.append("missing from an evidence file")
            blockers[fid] = why
            continue
        if any(item["state"] != state for _, item in items):
            why.append("evidence produced under a different state")
        if any((item.get("round_trip") or {}).get("status") == "DIFFERENT" for _, item in items):
            why.append("persistence round trip DIFFERENT in " + ",".join(l for l, i in items if (i.get("round_trip") or {}).get("status") == "DIFFERENT"))
        if state == "available":
            for label, item in items:
                for check, result in (item["run1"].get("checks") or {}).items():
                    if not result["ok"]:
                        why.append(f"check {check} failed in {label}: {result['detail']}")
            runs = [item.get("deterministic") for _, item in items if "deterministic" in item]
            if len(runs) < MIN_DETERMINISM_DEMOS or not all(runs):
                why.append(f"determinism: {sum(bool(r) for r in runs)}/{len(runs)} demos (need >= {MIN_DETERMINISM_DEMOS}, all equal)")
            if not any(item["run1"]["non_null"] > 0 for _, item in items):
                why.append("never non-null in a real demo")
            trips = [(item.get("round_trip") or {}).get("status") for _, item in items]
            if "EXCLUDED" not in trips and "EQUAL" not in trips:
                why.append("no persistence round trip")
        elif state in REPRESENTATION_STATES:
            for label, item in items:
                if not (item["run1"].get("representation") or {}).get("ok"):
                    why.append(f"representation violated in {label}")
        if why:
            blockers[fid] = why
    return {"status": "PASS" if not blockers else "BLOCKED", "blockers": blockers,
            "evidenceDemos": [e["label"] for e in evidence]}


def evaluate_browser(contract: dict, root: Path = ROOT) -> dict[str, Any]:
    blockers: dict[str, list[str]] = {}
    missing = [path for path, marker in BROWSER_MARKERS.items()
               if not (root / path).is_file() or marker not in (root / path).read_text(encoding="utf-8")]
    for field in contract["fields"]:
        state = field["paths"]["browser"]["state"]
        why = []
        if state != "not_authorized":
            why.append(f"browser state {state} has no evidence producer")
        if missing:
            why.append(f"policy markers missing: {missing}")
        if why:
            blockers[field["id"]] = why
    return {"status": "PASS" if not blockers else "BLOCKED", "blockers": blockers,
            "meaning": "browser path: every field classified not_authorized (no browser Canonical writer); nothing is authorized to persist"}


def evaluate(evidence_dir: Path = EVIDENCE_DIR) -> dict[str, Any]:
    contract = build_contract()
    if not contract["fieldCount"] == len(FIELD_SPECS) == 105:
        raise SystemExit("V3_FIELD_SET_CHANGED")
    server = evaluate_server(contract, load_evidence(evidence_dir))
    browser = evaluate_browser(contract)
    counts: dict[str, dict[str, int]] = {"server": {}, "browser": {}}
    for f in contract["fields"]:
        for path in counts:
            s = f["paths"][path]["state"]
            counts[path][s] = counts[path].get(s, 0) + 1
    return {"contract": CONTRACT_VERSION, "contractDigest": contract["digest"], "fieldCount": contract["fieldCount"],
            "stateCounts": counts, "server": server, "browser": browser,
            "status": "PASS" if server["status"] == browser["status"] == "PASS" else "BLOCKED"}


if __name__ == "__main__":
    result = evaluate()
    json.dump(result, sys.stdout, indent=1)
    sys.stdout.write("\n")
    sys.exit(0 if result["status"] == "PASS" else 1)
