"""A9.1 lightweight Python reference producer.

This is deliberately NOT the production RAW/forensic parser path. A9.1 proves
cross-runtime parity and determinism on the authorized real DEM. It must query
only the same bounded domains as the pinned WASM reference and must not retain
the production adapter's full event/tick/grenade material in memory.

The previous implementation called services/cs2-demo-parser/parser.py, which
parses every discovered event, builds RAW evidence, performs production
post-processing and retains large intermediate structures. On the 473 MB real
DEM that path terminated as A91_RUNTIME_RESOURCE_FAILURE during python_run_1.
The A9.1 reference path is intentionally isolated from that production path.
"""

from __future__ import annotations

import hashlib
import json
import math
import platform
import sys
import time
import uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.a91.tick_probe import derive_tick_probe
FILENAME = "furia-vs-gamerlegion-m1-cache.dem"
SIZE = 473748061
SHA = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d"
PARSER_VERSION = "0.42.0"
PARSER_REVISION = "d3767705dc5846d73ed29db50eaeda58778dc934"
MANIFEST = ROOT / "docs/client-parser/upstream-surface-manifest.json"
MAX_SAMPLE = 1000
MAX_GRENADE_SAMPLE = 256
MAX_TICK_FIELDS = 32
MAX_DEMO_BYTES = 1_500 * 1024 * 1024
RECORD_CHUNK_ROWS = 2048
PROGRESS_PATH = Path(__import__("os").environ["A91_PROGRESS_PATH"]) if __import__("os").environ.get("A91_PROGRESS_PATH") else None


def stable(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def digest(value: Any) -> str:
    return hashlib.sha256(stable(value).encode("utf-8")).hexdigest()


def normalize(value: Any) -> Any:
    """Convert pandas/numpy values to JSON values without inventing data."""
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): normalize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize(v) for v in value]
    item = getattr(value, "item", None)
    if callable(item):
        try:
            return normalize(item())
        except Exception:
            pass
    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        try:
            return normalize(to_dict(orient="records"))
        except TypeError:
            try:
                return normalize(to_dict())
            except Exception:
                pass
    return str(value)


def sample(value: Any, limit: int = MAX_SAMPLE) -> Any:
    value = normalize(value)
    if isinstance(value, list):
        return [sample(v, limit) for v in value[:limit]]
    if isinstance(value, dict):
        return {k: sample(v, limit) for k, v in value.items()}
    return value


def read_manifest() -> dict[str, Any]:
    value = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if value.get("provenance", {}).get("commit") != PARSER_REVISION:
        raise RuntimeError("PARSER_IDENTITY_MISMATCH")
    catalog_payload = {
        "provenance": value["provenance"],
        "apis": value["apis"],
        "fields": value["fields"],
        "events": value["events"],
    }
    if digest(catalog_payload) != value.get("catalogDigest"):
        raise RuntimeError("CATALOG_MISMATCH")
    contract_payload = {
        "contractVersion": value["contractVersion"],
        "catalogVersion": value["catalogVersion"],
        "catalogDigest": value["catalogDigest"],
        "limits": value["limits"],
        "policies": value["policies"],
    }
    if digest(contract_payload) != value.get("contractDigest"):
        raise RuntimeError("CONTRACT_MISMATCH")
    return value


def validate(path: Path, authorization: dict[str, Any]) -> None:
    if not path.is_file() or path.suffix.lower() != ".dem":
        raise RuntimeError("EXPLICIT_AUTHORIZED_DEM_PATH_REQUIRED")
    size = path.stat().st_size
    if (
        authorization.get("authorizedDemo") is not True
        or authorization.get("source") != "LOCAL_FILE"
        or authorization.get("provenance") != "LOCAL_FILE"
        or authorization.get("filename") != path.name
        or authorization.get("sizeBytes") != size
        or authorization.get("sha256") != SHA
        or size != SIZE
    ):
        raise RuntimeError("AUTHORIZED_DEM_METADATA_MISMATCH")
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    if h.hexdigest() != SHA:
        raise RuntimeError("A91_DEM_SHA256_MISMATCH")


def progress(stage: str) -> None:
    if PROGRESS_PATH is None:
        return
    try:
        PROGRESS_PATH.write_text(stage + "\n", encoding="utf-8")
    except Exception:
        pass


def iter_normalized_records(frame: Any):
    """Yield normalized records without materializing an entire DataFrame."""
    if frame is None:
        return
    if isinstance(frame, list):
        for row in frame:
            normalized = normalize(row)
            if isinstance(normalized, dict):
                yield normalized
        return
    to_dict = getattr(frame, "to_dict", None)
    if not callable(to_dict):
        return
    iloc = getattr(frame, "iloc", None)
    total = len(frame)
    if iloc is None:
        rows = to_dict(orient="records")
        for row in rows:
            normalized = normalize(row)
            if isinstance(normalized, dict):
                yield normalized
        return
    for start in range(0, total, RECORD_CHUNK_ROWS):
        chunk = frame.iloc[start : start + RECORD_CHUNK_ROWS]
        for row in chunk.to_dict(orient="records"):
            normalized = normalize(row)
            if isinstance(normalized, dict):
                yield normalized
        del chunk


def summarize_records(frame: Any, sample_limit: int = MAX_SAMPLE) -> dict[str, Any]:
    """Digest records with bounded Python memory; retain only a small sample."""
    hasher = hashlib.sha256()
    hasher.update(b"[")
    first = True
    count = 0
    returned_fields: set[str] = set()
    samples: list[dict[str, Any]] = []
    for row in iter_normalized_records(frame):
        if not first:
            hasher.update(b",")
        first = False
        hasher.update(stable(row).encode("utf-8"))
        count += 1
        returned_fields.update(row.keys())
        if len(samples) < sample_limit:
            samples.append(row)
    hasher.update(b"]")
    return {"digest": hasher.hexdigest(), "count": count, "returnedFields": sorted(returned_fields), "samples": samples}


def records(frame: Any) -> list[dict[str, Any]]:
    """Bounded materialization for domains known to remain small."""
    return list(iter_normalized_records(frame))

def event_request(event: dict[str, Any]) -> tuple[list[str], list[str]]:
    player = [
        item["field"]
        for item in event.get("playerFields", [])
        if item.get("requestAllowed") is True
    ]
    other = [
        item["field"]
        for item in event.get("otherFields", [])
        if item.get("requestAllowed") is True
    ]
    return player, other

def tick_request(surface: dict[str, Any], limit: int = MAX_TICK_FIELDS) -> list[str]:
    """Match the WASM gate: request only runtime fields supported upstream."""
    return [
        item["propertyName"]
        for item in surface.get("fields", [])
        if item.get("sourceApi") == "parseTicks"
        and item.get("runtimeRequestable") is True
        and item.get("upstreamSupported") is True
    ][:limit]


def parse_event(parser: Any, event: dict[str, Any]) -> dict[str, Any]:
    name = event["eventName"]
    progress("parse_event:" + name)
    player, other = event_request(event)
    frame = parser.parse_event(name, player=player, other=other)
    summary = summarize_records(frame)
    requested = player + other
    return {
        "eventName": name,
        "status": "SUCCEEDED",
        "requestedPlayerFields": player,
        "requestedOtherFields": other,
        "requestEvidence": [
            *[item for item in event.get("playerFields", []) if item.get("requestAllowed") is True],
            *[item for item in event.get("otherFields", []) if item.get("requestAllowed") is True],
        ],
        "unavailableFields": [field for field in requested if field not in summary["returnedFields"]],
        "count": summary["count"],
        "fullDigest": summary["digest"],
        "returnedFields": summary["returnedFields"],
        "samples": summary["samples"],
    }


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) >= 2 else None
    authorization = json.loads(sys.argv[2]) if len(sys.argv) == 3 else None
    if path is None or authorization is None:
        raise RuntimeError("NO_AUTHORIZED_REAL_DEM")
    progress("validate")
    validate(path, authorization)
    progress("read_manifest")
    surface = read_manifest()
    started = time.perf_counter()
    progress("python_import_demoparser2")
    from demoparser2 import DemoParser

    progress("parser_init")
    parser = DemoParser(str(path))

    progress("parse_header")
    header = normalize(parser.parse_header())
    progress("list_game_events")
    inventory = normalize(parser.list_game_events())
    progress("list_updated_fields")
    fields = normalize(parser.list_updated_fields())

    events: list[dict[str, Any]] = []
    progress("parse_events:start")
    for event in surface["events"]:
        evidence = parse_event(parser, event)
        events.append(
            {
                "eventName": evidence["eventName"],
                "status": evidence["status"],
                "count": evidence["count"],
                "fullDigest": evidence["fullDigest"],
                "samples": evidence["samples"],
            }
        )

    progress("parse_grenades")
    grenade_summary = summarize_records(parser.parse_grenades(), MAX_GRENADE_SAMPLE)
    progress("scan_demo_tick_probe")
    tick_probe = derive_tick_probe(path)
    wanted_ticks = tick_probe["wantedTicks"]
    requested_fields = tick_request(surface)
    progress("parse_ticks")
    tick_summary = summarize_records(parser.parse_ticks(requested_fields, ticks=wanted_ticks))
    if tick_summary["count"] == 0:
        raise RuntimeError("A91_TICK_PROBE_EMPTY")

    # Python has player-info support; WASM is explicitly unavailable. Keep the
    # difference explicit so parity becomes NOT_COMPARABLE rather than inferred.
    progress("parse_player_info")
    player_summary = summarize_records(parser.parse_player_info(), 128)
    progress("finalize")

    normalized_result = {
        "header": header,
        "events": events,
        "grenades": grenade_summary["samples"],
        "ticks": tick_summary["samples"],
        "playerIdentity": {
            "status": "AVAILABLE_ON_PYTHON",
            "value": player_summary["samples"],
        },
    }

    by_name = lambda predicate: [item for item in events if predicate(item["eventName"])]
    artifact = {
        "artifactVersion": 2,
        "runtime": "PYTHON",
        "runId": f"python:{SHA}:{uuid.uuid4()}",
        "executionKind": "REAL_DEM_FULL_FILE",
        "test_fixture_only": False,
        "status": "SUCCEEDED",
        "reason": None,
        "demoSha256": SHA,
        "demoSizeBytes": SIZE,
        "parserVersion": PARSER_VERSION,
        "parserRevision": PARSER_REVISION,
        "catalogVersion": surface["catalogVersion"],
        "catalogDigest": surface["catalogDigest"],
        "contractVersion": surface["contractVersion"],
        "contractDigest": surface["contractDigest"],
        "artifactIdentity": None,
        "environmentFingerprint": {
            "pythonVersion": platform.python_version(),
            "platform": platform.platform(),
        },
        "apiCalls": [
            {"api": "parseHeader", "status": "SUCCEEDED", "outputDigest": digest(header)},
            {"api": "listGameEvents", "status": "SUCCEEDED", "outputDigest": digest(inventory), "count": len(inventory)},
            {"api": "listUpdatedFields", "status": "SUCCEEDED", "outputDigest": digest(fields), "count": len(fields)},
            *[
                {
                    "api": "parseEvent",
                    "status": "SUCCEEDED",
                    "eventName": item["eventName"],
                    "count": item["count"],
                    "outputDigest": item["fullDigest"],
                }
                for item in events
            ],
            {"api": "parseGrenades", "status": "SUCCEEDED", "outputDigest": grenade_summary["digest"], "count": grenade_summary["count"]},
            {
                "api": "parseTicks",
                "status": "SUCCEEDED",
                "wantedTicks": wanted_ticks,
                "requestedFields": requested_fields,
                "tickProbeSource": tick_probe["source"],
                "maxFrameTick": tick_probe["maxFrameTick"],
                "outputDigest": tick_summary["digest"],
                "count": tick_summary["count"],
            },
            {"api": "parsePlayerInfo", "status": "SUCCEEDED", "outputDigest": player_summary["digest"], "count": player_summary["count"]},
        ],
        "fieldInventory": sample(fields),
        "eventInventory": sample(inventory, 1024),
        "eventInventoryDigest": digest(inventory),
        "headerEvidence": header,
        "mapEvidence": {"map": header.get("map_name")},
        "timingEvidence": {"header": header, "tickProbe": tick_probe},
        "playerInventory": {"status": "AVAILABLE_ON_PYTHON", "value": player_summary["samples"]},
        "domainAvailability": {
            "players": "AVAILABLE",
            "player_identity": "AVAILABLE",
        },
        "eventEvidence": events,
        "roundEvidence": by_name(lambda name: name.startswith("round_")),
        "grenadeEvidence": grenade_summary["samples"],
        "bombEvidence": by_name(lambda name: name.startswith("bomb_")),
        "deathEvidence": by_name(lambda name: name == "player_death"),
        "damageEvidence": by_name(lambda name: name == "player_hurt"),
        "weaponEvidence": by_name(lambda name: name.startswith("weapon_") or name.startswith("item_")),
        "economyEvidence": {"status": "BOUNDED_TICK_PROBE", "value": tick_summary["samples"]},
        "tickDomainEvidence": {
            "tickProbeSource": tick_probe["source"],
            "maxFrameTick": tick_probe["maxFrameTick"],
            "requestedFields": requested_fields,
            "wantedTicks": wanted_ticks,
            "authoritativeDomain": False,
            "value": tick_summary["samples"],
        },
        "normalizedResult": normalized_result,
        "normalizedResultDigest": digest(normalized_result),
        "resultDigest": digest(normalized_result),
        "rawDigest": digest(
            [{"api": item["eventName"], "digest": item["fullDigest"]} for item in events]
        ),
        "eventDigest": digest(events),
        "tickDigest": tick_summary["digest"],
        "roundDigest": digest(by_name(lambda name: name.startswith("round_"))),
        "playerDigest": player_summary["digest"],
        "durationMs": round((time.perf_counter() - started) * 1000, 3),
        "canonicalEligible": False,
        "canonicalAuthorization": False,
        "attempt9Authorization": False,
        "productionAuthorization": False,
        "persisted": False,
    }
    print(json.dumps(artifact, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        # stderr is private to the isolated runner. Keep stdout empty on failure
        # so execute.py never mistakes a partial artifact for success.
        print(str(error), file=sys.stderr)
        raise
