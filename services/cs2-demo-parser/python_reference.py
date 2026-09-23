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
import uuid
from pathlib import Path
from typing import Any

from errors import (
    AUTHORIZED_DEM_METADATA_MISMATCH,
    AUTHORIZED_DEM_SIZE_OUT_OF_BOUNDS,
    EXPLICIT_AUTHORIZED_DEM_PATH_REQUIRED,
    NO_AUTHORIZED_REAL_DEM,
    NO_AUTHORIZED_REAL_DEM_FIXTURE,
)
from parser import parse_demo_file

MAX_DEMO_BYTES = 1_500 * 1024 * 1024
PARSER_VERSION = "0.42.0"
PARSER_REVISION = "d3767705dc5846d73ed29db50eaeda58778dc934"
SURFACE_MANIFEST_PATH = Path(__file__).resolve().parents[2] / "docs/client-parser/upstream-surface-manifest.json"


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(value: Any) -> str:
    return hashlib.sha256(_stable_json(value).encode()).hexdigest()


def _manifest() -> dict[str, Any]:
    with SURFACE_MANIFEST_PATH.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if value.get("provenance", {}).get("commit") != PARSER_REVISION:
        raise ValueError("catalog_parser_revision_mismatch")
    catalog_payload = {
        "provenance": value["provenance"],
        "apis": value["apis"],
        "fields": value["fields"],
        "events": value["events"],
    }
    if _digest(catalog_payload) != value.get("catalogDigest"):
        raise ValueError("catalog_digest_mismatch")
    contract_payload = {
        "contractVersion": value["contractVersion"],
        "catalogVersion": value["catalogVersion"],
        "catalogDigest": value["catalogDigest"],
        "limits": value["limits"],
        "policies": value["policies"],
    }
    if _digest(contract_payload) != value.get("contractDigest"):
        raise ValueError("contract_digest_mismatch")
    return value


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


def build_python_reference(path_value: str | None, authorization: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path_value:
        return {
            "status": "NOT_RUN",
            "reason": NO_AUTHORIZED_REAL_DEM_FIXTURE,
            "canonicalEligible": False,
            "persisted": False,
        }
    path = Path(path_value)
    if not path.is_file() or path.suffix.lower() != ".dem":
        raise ValueError(EXPLICIT_AUTHORIZED_DEM_PATH_REQUIRED)
    if not authorization or authorization.get("authorizedDemo") is not True:
        raise ValueError(NO_AUTHORIZED_REAL_DEM)
    required_authorization = {"provenance", "filename", "sha256", "sizeBytes", "source", "authorizationRef", "receivedAt"}
    if not required_authorization.issubset(authorization) or authorization.get("source") != "LOCAL_FILE":
        raise ValueError(NO_AUTHORIZED_REAL_DEM)
    size = path.stat().st_size
    if size < 1 or size > MAX_DEMO_BYTES:
        raise ValueError(AUTHORIZED_DEM_SIZE_OUT_OF_BOUNDS)
    started = time.perf_counter()
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    demo_sha = _sha256(path)
    if authorization["filename"] != path.name or authorization["sizeBytes"] != size or authorization["sha256"] != demo_sha:
        raise ValueError(AUTHORIZED_DEM_METADATA_MISMATCH)
    surface = _manifest()
    output = parse_demo_file(str(path))
    raw = output.get("raw_evidence") or {}
    header = _domain(output, "header", {})
    players = _domain(output, "players", [])
    events = _domain(output, "events", [])
    rounds = _domain(output, "rounds", [])
    grenades = _bounded(raw.get("grenade_samples") or [])
    field_inventory = sorted(
        {
            str(key)
            for section in (header, *players, *events, *rounds, *grenades)
            if isinstance(section, dict)
            for key in section
        }
    )
    event_inventory = [
        str(item.get("event_name"))
        for item in raw.get("event_coverage") or []
        if isinstance(item, dict) and item.get("event_name") is not None
    ]
    normalized_result = _bounded(
        {"header": header, "players": players, "events": events, "rounds": rounds, "grenades": grenades}
    )
    normalized_digest = hashlib.sha256(
        json.dumps(normalized_result, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()
    run_id = f"python:{demo_sha}:{uuid.uuid4()}"
    generated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    field_evidence = [
        {
            "field": item["propertyName"],
            "upstreamSupported": item["upstreamSupported"],
            "requested": False,
            "parsed": item["propertyName"] in field_inventory,
            "value": None,
            "evidenceRefs": item["evidenceRefs"],
            "status": "OBSERVED_IN_BOUNDED_OUTPUT" if item["propertyName"] in field_inventory else "NOT_OBSERVED",
        }
        for item in surface["fields"]
    ]
    event_evidence = [
        {
            "eventName": item["eventName"],
            "catalogued": True,
            "observed": item["eventName"] in event_inventory,
            "requestCatalogDigest": surface["catalogDigest"],
            "evidenceRefs": item["evidenceRefs"],
        }
        for item in surface["events"]
    ]
    grenade_evidence = [
        {
            "raw": item,
            "normalizedGrenadeType": None,
            "normalizedGrenadeIdentity": None,
            "normalizedPosition": None,
            "lifecycle": "UNRESOLVED",
            "normalization": "RAW_ONLY",
        }
        for item in grenades
    ]
    tick_evidence = {
        "source": "python_raw_evidence",
        "probeType": "BOUNDED_REFERENCE",
        "authoritativeDomain": False,
        "value": _bounded(raw.get("forensic_contract_v2", {}).get("tick_domain", {})),
    }
    artifact: dict[str, Any] = {
        "artifactVersion": 2,
        "runId": run_id,
        "runtime": "PYTHON",
        "demoSha256": demo_sha,
        "demoSizeBytes": size,
        "parserName": "demoparser2-python",
        "parserVersion": PARSER_VERSION,
        "parserRevision": PARSER_REVISION,
        "catalogVersion": surface["catalogVersion"],
        "contractVersion": surface["contractVersion"],
        "catalogDigest": surface["catalogDigest"],
        "contractDigest": surface["contractDigest"],
        "generatedAt": generated_at,
        "sections": ["header", "players", "events", "rounds", "grenades", "ticks"],
        "fieldEvidence": field_evidence,
        "eventEvidence": event_evidence,
        "roundEvidence": rounds,
        "grenadeEvidence": grenade_evidence,
        "tickEvidence": tick_evidence,
        "fieldInventory": field_inventory,
        "eventInventory": event_inventory,
        "playerInventory": players,
        "roundInventory": rounds,
        "grenadeInventory": grenades,
        "headerEvidence": header,
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
        "normalizedResult": normalized_result,
        "normalizedResultDigest": normalized_digest,
        "resultDigest": normalized_digest,
        "startedAt": started_at,
        "durationMs": 0,
        "status": "SUCCEEDED",
        "evidenceStatus": "BOUNDED_REFERENCE",
        "canonicalEligible": False,
        "persisted": False,
    }
    artifact["runIdentity"] = {
        "runId": artifact["runId"],
        "runtime": "PYTHON",
        "demoSha256": demo_sha,
        "parserIdentity": artifact["parserName"],
        "parserVersion": PARSER_VERSION,
        "parserRevision": PARSER_REVISION,
        "artifactIdentity": None,
        "catalogVersion": surface["catalogVersion"],
        "catalogDigest": surface["catalogDigest"],
        "contractVersion": surface["contractVersion"],
        "contractDigest": surface["contractDigest"],
        "normalizedDigest": normalized_digest,
        "startedAt": started_at,
        "durationMs": 0,
        "status": "SUCCEEDED",
    }
    artifact["durationMs"] = round((time.perf_counter() - started) * 1_000, 3)
    artifact["runIdentity"]["durationMs"] = artifact["durationMs"]
    if not _finite(artifact):
        raise ValueError("python_reference_contains_non_finite_value")
    return artifact


def main(argv: list[str]) -> int:
    path_value = argv[1] if len(argv) >= 2 else None
    authorization = json.loads(argv[2]) if len(argv) == 3 else None
    artifact = build_python_reference(path_value, authorization)
    print(json.dumps(artifact, sort_keys=True, separators=(",", ":")))
    return 0 if artifact.get("status") == "SUCCEEDED" else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))