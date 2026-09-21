"""Bounded Python reference-artifact producer for an authorized real CS2 DEM.

This module never discovers or chooses a fixture implicitly. The caller must
pass an explicit file path. Without one it emits the official NOT_RUN status.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

from parser import parse_demo_file

MAX_DEMO_BYTES = 128 * 1024 * 1024
PARSER_VERSION = "0.42.0"
PARSER_REVISION = "d3767705dc5846d73ed29db50eaeda58778dc934"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _finite(value: Any) -> bool:
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return True
    if isinstance(value, (int, float)):
        return math.isfinite(float(value))
    if isinstance(value, list):
        return all(_finite(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and _finite(item) for key, item in value.items())
    return False


def _bounded(value: Any, limit: int = 1_000) -> Any:
    if isinstance(value, list):
        return [_bounded(item, limit) for item in value[:limit]]
    if isinstance(value, dict):
        return {str(key): _bounded(item, limit) for key, item in sorted(value.items())[:256]}
    return value


def _domain(output: dict[str, Any], key: str, fallback: Any) -> Any:
    value = output.get(key, fallback)
    return _bounded(value)


def build_python_reference(path_value: str | None) -> dict[str, Any]:
    if not path_value:
        return {
            "status": "NOT_RUN",
            "reason": "NO_AUTHORIZED_REAL_DEM_FIXTURE",
            "canonicalEligible": False,
            "persisted": False,
        }
    path = Path(path_value)
    if not path.is_file() or path.suffix.lower() != ".dem":
        raise ValueError("explicit_authorized_dem_path_required")
    size = path.stat().st_size
    if size < 1 or size > MAX_DEMO_BYTES:
        raise ValueError("authorized_dem_size_out_of_bounds")
    started = time.perf_counter()
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    demo_sha = _sha256(path)
    output = parse_demo_file(str(path))
    raw = output.get("raw_evidence") or {}
    artifact: dict[str, Any] = {
        "runId": f"python:{demo_sha}:1",
        "runtime": "PYTHON",
        "demoSha256": demo_sha,
        "parserName": "demoparser2-python",
        "parserVersion": PARSER_VERSION,
        "parserRevision": PARSER_REVISION,
        "headerEvidence": _domain(output, "header", {}),
        "playerEvidence": _domain(output, "players", []),
        "eventEvidence": _domain(output, "events", []),
        "grenadeEvidence": _bounded(raw.get("grenade_samples") or []),
        "roundEvidence": _domain(output, "rounds", []),
        "tickDomainEvidence": _bounded(raw.get("forensic_contract_v2", {}).get("tick_domain", {})),
        "timingEvidence": _bounded({"header": output.get("header", {}), "rounds": output.get("rounds", [])}),
        "mapEvidence": _bounded({"map": (output.get("header") or {}).get("map")}),
        "scoreEvidence": _bounded({"rounds": output.get("rounds", [])}),
        "teamEvidence": _bounded({"players": output.get("players", [])}),
        "bombEvidence": _bounded([item for item in output.get("events", []) if str(item.get("type", "")).startswith("bomb_")]),
        "deathEvidence": _bounded([item for item in output.get("events", []) if item.get("type") == "player_death"]),
        "damageEvidence": _bounded([item for item in output.get("events", []) if item.get("type") == "player_hurt"]),
        "economyEvidence": _bounded(raw.get("economy_coverage") or []),
        "weaponEvidence": _bounded([item for item in output.get("events", []) if str(item.get("type", "")).startswith(("weapon_", "item_"))]),
        "positionEvidence": _bounded(raw.get("tick_samples") or []),
        "aimEvidence": _bounded(raw.get("tick_samples") or []),
        "normalizedDigest": "",
        "startedAt": started_at,
        "durationMs": 0,
        "status": "SUCCEEDED",
        "evidenceStatus": "BOUNDED_REFERENCE",
        "canonicalEligible": False,
        "persisted": False,
    }
    artifact["durationMs"] = round((time.perf_counter() - started) * 1_000, 3)
    deterministic = {key: value for key, value in artifact.items() if key not in {"normalizedDigest", "startedAt", "durationMs", "runId"}}
    artifact["normalizedDigest"] = hashlib.sha256(
        json.dumps(deterministic, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()
    if not _finite(artifact):
        raise ValueError("python_reference_contains_non_finite_value")
    return artifact


def main(argv: list[str]) -> int:
    artifact = build_python_reference(argv[1] if len(argv) == 2 else None)
    print(json.dumps(artifact, sort_keys=True, separators=(",", ":")))
    return 0 if artifact.get("status") == "SUCCEEDED" else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))