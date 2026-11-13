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
from scripts.a91 import canonical_schema as canonical
FILENAME = "furia-vs-gamerlegion-m1-cache.dem"
SIZE = 473748061
SHA = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d"
AUTH = "A9.1-M1-CACHE-REAL-DEM"
# Public upstream test demo used ONLY by the automatic regression gate. Mirrors
# PUBLIC_FIXTURE in scripts/a91/contracts.mjs: artifacts produced from it carry
# test_fixture_only and a distinct executionKind, both rejected by decide().
PROFILES = {
    AUTH: {
        "filename": FILENAME,
        "size": SIZE,
        "sha": SHA,
        "executionKind": "REAL_DEM_FULL_FILE",
        "testFixtureOnly": False,
    },
    "A9.1-PUBLIC-FIXTURE-DEMOPARSER-TEST-DEMO": {
        "filename": "test_demo.dem",
        "size": 60601900,
        "sha": "84a1a4191302bdd2a3bbb5a727842093744b1fb1a228aeec630369e44b622cb2",
        "executionKind": "PUBLIC_FIXTURE_FULL_FILE",
        "testFixtureOnly": True,
    },
}
PARSER_VERSION = "0.42.0"
PARSER_REVISION = "d3767705dc5846d73ed29db50eaeda58778dc934"
MANIFEST = ROOT / "docs/client-parser/upstream-surface-manifest.json"
MAX_SAMPLE = 1000
MAX_GRENADE_SAMPLE = 256
MAX_TICK_FIELDS = 32
MAX_DEMO_BYTES = 1_500 * 1024 * 1024
RECORD_CHUNK_ROWS = 2048
PROGRESS_PATH = Path(__import__("os").environ["A91_PROGRESS_PATH"]) if __import__("os").environ.get("A91_PROGRESS_PATH") else None


def _ecmascript_number(value: int | float) -> str:
    """Format a JSON number like ECMAScript JSON.stringify/NumberToString.

    Python's json.dumps keeps integral floats as `1.0` and pads exponent
    digits (for example `1e-07`). JavaScript emits `1` and `1e-7`.
    The A9.1 digests must hash the same canonical bytes in both runtimes.
    """
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) <= 2**53 - 1:
            return str(value)
        # A JSON number above 2^53 cannot survive JavaScript's IEEE-754 doubles.
        # Rounding it here (the previous behaviour) silently corrupted 64-bit
        # identifiers such as Steam IDs. Identifiers must travel as canonical
        # decimal strings (scripts/a91/canonical contract rule R2); anything
        # else fails closed.
        raise ValueError("JSON_INTEGER_PRECISION_LOSS")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("NON_FINITE_JSON_NUMBER")
    if number == 0:
        return "0"  # Includes negative zero, as JSON.stringify does.

    negative = number < 0
    raw = repr(abs(number)).lower()
    if "e" in raw:
        mantissa, exponent_text = raw.split("e", 1)
        exponent = int(exponent_text)
    else:
        mantissa, exponent = raw, 0
    if "." in mantissa:
        whole, fraction = mantissa.split(".", 1)
    else:
        whole, fraction = mantissa, ""
    digits = whole + fraction
    decimal_position = len(whole) + exponent
    while len(digits) > 1 and digits.startswith("0"):
        digits = digits[1:]
        decimal_position -= 1
    while len(digits) > 1 and digits.endswith("0"):
        digits = digits[:-1]

    if decimal_position > 0 and decimal_position <= 21:
        if decimal_position >= len(digits):
            result = digits + ("0" * (decimal_position - len(digits)))
        else:
            result = digits[:decimal_position] + "." + digits[decimal_position:]
    elif decimal_position <= 0 and decimal_position > -6:
        result = "0." + ("0" * (-decimal_position)) + digits
    else:
        exponent_value = decimal_position - 1
        exponent_sign = "+" if exponent_value >= 0 else "-"
        result = digits[0]
        if len(digits) > 1:
            result += "." + digits[1:]
        result += "e" + exponent_sign + str(abs(exponent_value))
    return ("-" if negative else "") + result


def stable(value: Any) -> str:
    """Sorted-key canonical JSON with ECMAScript-compatible number formatting."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return _ecmascript_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(stable(item) for item in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise ValueError("NON_STRING_JSON_OBJECT_KEY")
        return "{" + ",".join(
            stable(key) + ":" + stable(value[key]) for key in sorted(value)
        ) + "}"
    raise ValueError("UNSUPPORTED_JSON_VALUE")


def digest(value: Any) -> str:
    return hashlib.sha256(stable(value).encode("utf-8")).hexdigest()


def normalize(value: Any) -> Any:
    """Convert pandas/numpy values to JSON values without inventing data."""
    # pandas nullable/Arrow-backed columns expose missing scalars such as
    # pd.NA and pd.NaT, which have no .item() method. Stringifying them as
    # "<NA>" or "NaT" makes Python's digest differ from WASM's JSON null.
    if value is None or type(value).__name__ in {"NAType", "NaTType"}:
        return None
    if isinstance(value, (str, bool, int)):
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


def validate(path: Path, authorization: dict[str, Any]) -> dict[str, Any]:
    if not path.is_file() or path.suffix.lower() != ".dem":
        raise RuntimeError("EXPLICIT_AUTHORIZED_DEM_PATH_REQUIRED")
    size = path.stat().st_size
    profile = PROFILES.get(authorization.get("authorizationRef"))
    if (
        profile is None
        or authorization.get("authorizedDemo") is not True
        or authorization.get("source") != "LOCAL_FILE"
        or authorization.get("provenance") != "LOCAL_FILE"
        or authorization.get("filename") != path.name
        or path.name != profile["filename"]
        or authorization.get("sizeBytes") != size
        or authorization.get("sha256") != profile["sha"]
        or size != profile["size"]
    ):
        raise RuntimeError("AUTHORIZED_DEM_METADATA_MISMATCH")
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    if h.hexdigest() != profile["sha"]:
        raise RuntimeError("A91_DEM_SHA256_MISMATCH")
    return profile


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
            # Mirror the WASM runner's recursive sample(value, limit) behavior.
            # Keep the full-record digest above unchanged; this only bounds the
            # retained sample and makes nested arrays/objects structurally equal.
            samples.append(sample(row, sample_limit))
    hasher.update(b"]")
    return {"digest": hasher.hexdigest(), "count": count, "returnedFields": sorted(returned_fields), "samples": samples}


def records(frame: Any) -> list[dict[str, Any]]:
    """Bounded materialization for domains known to remain small."""
    return list(iter_normalized_records(frame))

U64_DTYPES = {"uint64", "UInt64", "uint64[pyarrow]"}


def assert_u64_columns_registered(frame: Any) -> None:
    """A 64-bit column the contract does not know about fails closed."""
    dtypes = getattr(frame, "dtypes", None)
    items = getattr(dtypes, "items", None)
    if not callable(items):
        return
    for column, dtype in items():
        if str(dtype) in U64_DTYPES and not canonical.is_u64_field(str(column)):
            raise RuntimeError(f"A91_CANONICAL_UNREGISTERED_U64_FIELD:{column}")


def iter_raw_records(frame: Any):
    """Yield native row dicts in emission order without materializing the frame."""
    if frame is None:
        return
    if isinstance(frame, list):
        for row in frame:
            if isinstance(row, dict):
                yield row
        return
    if not callable(getattr(frame, "to_dict", None)):
        return
    if getattr(frame, "iloc", None) is None:
        yield from frame.to_dict(orient="records")
        return
    for start in range(0, len(frame), RECORD_CHUNK_ROWS):
        chunk = frame.iloc[start : start + RECORD_CHUNK_ROWS]
        yield from chunk.to_dict(orient="records")
        del chunk


def summarize_table(name: str, frame: Any) -> dict[str, Any]:
    """Canonical contract v1 summary of one table, in bounded memory.

    Values go to the canonicalizer in their native carriers (numpy uint64 for
    64-bit ids, float32/NaN for nullable columns); no lossy pre-normalization
    happens on the way.
    """
    assert_u64_columns_registered(frame)
    accumulator = canonical.TableAccumulator(name)
    for row in iter_raw_records(frame):
        accumulator.add_row(row)
    result = accumulator.finish()
    columns = getattr(frame, "columns", None)
    if columns is not None and result["summary"]["rowCount"] == 0:
        # An empty DataFrame still declares its columns; an empty row list does not.
        result["declaredFields"] = sorted(str(column) for column in columns)
    return result


def economy_projection(table: dict[str, Any]) -> dict[str, Any]:
    """Economy domain = the contract's economy columns of the tick table."""
    fields = [field for field in canonical.CONTRACT["economyFields"] if field in table["columns"]]
    if not fields:
        return {"status": "FAILED", "reason": "NO_ECONOMY_FIELDS"}
    return {
        "status": "TICK_PROJECTION",
        "canonicalContractVersion": table["canonicalContractVersion"],
        "rowCount": table["rowCount"],
        "fields": fields,
        "columns": {field: table["columns"][field] for field in fields},
    }


def build_semantic_evidence(
    *,
    header: dict[str, Any],
    events: list[dict[str, Any]],
    grenades: dict[str, Any],
    ticks: dict[str, Any],
    tick_probe: dict[str, Any],
    requested_fields: list[str],
    wanted_ticks: list[int],
) -> dict[str, Any]:
    """Semantic evidence shared by every Python artifact.

    scripts/a91/run_wasm_reference.mjs buildSemanticEvidence() must return the
    same keys with the same shapes (contract rule R11);
    scripts/a91/cross_runtime.check.mjs enforces it.
    """
    by_name = lambda predicate: [item for item in events if predicate(item["eventName"])]
    return {
        "headerEvidence": header,
        "mapEvidence": {"map": header.get("map_name")},
        "timingEvidence": {"header": header, "tickProbe": tick_probe},
        "eventEvidence": events,
        "roundEvidence": by_name(lambda name: name.startswith("round_")),
        "grenadeEvidence": {"table": grenades},
        "bombEvidence": by_name(lambda name: name.startswith("bomb_")),
        "deathEvidence": by_name(lambda name: name == "player_death"),
        "damageEvidence": by_name(lambda name: name == "player_hurt"),
        "weaponEvidence": by_name(lambda name: name.startswith("weapon_") or name.startswith("item_")),
        "economyEvidence": economy_projection(ticks),
        "tickDomainEvidence": {
            "tickProbeSource": tick_probe["source"],
            "maxFrameTick": tick_probe["maxFrameTick"],
            "requestedFields": requested_fields,
            "wantedTicks": wanted_ticks,
            "authoritativeDomain": False,
            "table": ticks,
        },
    }


def canonical_string_inventory(value: Any, name: str) -> list[str]:
    """Sort set-backed string inventories without changing their semantic content."""
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise RuntimeError(f"{name}_INVENTORY_SHAPE_INVALID")
    return sorted(value)


def lossy_reference_player_fields() -> list[str]:
    return list(canonical.CONTRACT["referenceLossyRequestFields"]["eventPlayer"])


def event_request(event: dict[str, Any]) -> tuple[list[str], list[str]]:
    # Contract rule R12: properties the Python binding can only deliver rounded
    # (nullable 64-bit ids become float64) are not requested at all.
    lossy = set(lossy_reference_player_fields())
    player = [
        item["field"]
        for item in event.get("playerFields", [])
        if item.get("requestAllowed") is True and item["field"] not in lossy
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
    """Return {"semantic": ..., "call": ..., "diagnostics": ...} for one event.

    `semantic` has exactly the keys the WASM producer emits (contract rule R11);
    requested/returned field lists are call evidence and live beside it.
    """
    name = event["eventName"]
    progress("parse_event:" + name)
    player, other = event_request(event)
    frame = parser.parse_event(name, player=player, other=other)
    table = summarize_table("event:" + name, frame)
    summary = table["summary"]
    requested = player + other
    returned = summary["fields"] or table.get("declaredFields", [])
    return {
        "semantic": {"eventName": name, "status": "SUCCEEDED", "table": summary},
        "call": {
            "api": "parseEvent",
            "status": "SUCCEEDED",
            "eventName": name,
            "count": summary["rowCount"],
            "outputDigest": summary["tableDigest"],
            "requestedPlayerFields": player,
            "requestedOtherFields": other,
            "requestEvidence": [
                *[item for item in event.get("playerFields", []) if item.get("requestAllowed") is True],
                *[item for item in event.get("otherFields", []) if item.get("requestAllowed") is True],
            ],
            "returnedFields": returned,
            "unavailableFields": [field for field in requested if field not in returned],
            "excludedRequestFields": [
                item["field"]
                for item in event.get("playerFields", [])
                if item.get("requestAllowed") is True and item["field"] in lossy_reference_player_fields()
            ],
        },
        "diagnostics": table["diagnostics"],
    }


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) >= 2 else None
    authorization = json.loads(sys.argv[2]) if len(sys.argv) == 3 else None
    if path is None or authorization is None:
        raise RuntimeError("NO_AUTHORIZED_REAL_DEM")
    progress("validate")
    profile = validate(path, authorization)
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
    inventory = canonical_string_inventory(normalize(parser.list_game_events()), "GAME_EVENTS")
    progress("list_updated_fields")
    fields = canonical_string_inventory(normalize(parser.list_updated_fields()), "UPDATED_FIELDS")

    events: list[dict[str, Any]] = []
    event_calls: list[dict[str, Any]] = []
    table_diagnostics: dict[str, Any] = {}
    progress("parse_events:start")
    for event in surface["events"]:
        evidence = parse_event(parser, event)
        events.append(evidence["semantic"])
        event_calls.append(evidence["call"])
        table_diagnostics["event:" + event["eventName"]] = evidence["diagnostics"]

    progress("parse_grenades")
    grenade_table = summarize_table("grenades", parser.parse_grenades())
    grenade_summary = grenade_table["summary"]
    table_diagnostics["grenades"] = grenade_table["diagnostics"]
    progress("scan_demo_tick_probe")
    tick_probe = derive_tick_probe(path)
    wanted_ticks = tick_probe["wantedTicks"]
    requested_fields = tick_request(surface)
    progress("parse_ticks")
    tick_table = summarize_table("ticks", parser.parse_ticks(requested_fields, ticks=wanted_ticks))
    tick_summary = tick_table["summary"]
    table_diagnostics["ticks"] = tick_table["diagnostics"]
    if tick_summary["rowCount"] == 0:
        raise RuntimeError("A91_TICK_PROBE_EMPTY")

    # Python has player-info support; WASM is explicitly unavailable. Keep the
    # difference explicit so parity becomes NOT_COMPARABLE rather than inferred.
    progress("parse_player_info")
    player_summary = summarize_table("players", parser.parse_player_info())["summary"]
    progress("finalize")

    # Semantic evidence only (contract rule R11): the same keys, in the same
    # shape, as scripts/a91/run_wasm_reference.mjs. Table summaries carry the
    # full-table digests, so determinism now covers every row, not a sample.
    normalized_result = {
        "header": header,
        "events": events,
        "grenades": grenade_summary,
        "ticks": tick_summary,
        "playerIdentity": {
            "status": "AVAILABLE_ON_PYTHON",
            "value": player_summary,
        },
    }
    api_calls = [
        {"api": "parseHeader", "status": "SUCCEEDED", "outputDigest": digest(header)},
        {"api": "listGameEvents", "status": "SUCCEEDED", "outputDigest": digest(inventory), "count": len(inventory)},
        {"api": "listUpdatedFields", "status": "SUCCEEDED", "outputDigest": digest(fields), "count": len(fields)},
        *event_calls,
        {
            "api": "parseGrenades",
            "status": "SUCCEEDED",
            "outputDigest": grenade_summary["tableDigest"],
            "count": grenade_summary["rowCount"],
            "returnedFields": grenade_summary["fields"],
        },
        {
            "api": "parseTicks",
            "status": "SUCCEEDED",
            "wantedTicks": wanted_ticks,
            "requestedFields": requested_fields,
            "tickProbeSource": tick_probe["source"],
            "maxFrameTick": tick_probe["maxFrameTick"],
            "outputDigest": tick_summary["tableDigest"],
            "count": tick_summary["rowCount"],
            "returnedFields": tick_summary["fields"],
        },
        {
            "api": "parsePlayerInfo",
            "status": "SUCCEEDED",
            "outputDigest": player_summary["tableDigest"],
            "count": player_summary["rowCount"],
        },
    ]

    by_name = lambda predicate: [item for item in events if predicate(item["eventName"])]
    artifact = {
        "artifactVersion": 3,
        "runtime": "PYTHON",
        "runId": f"python:{profile['sha']}:{uuid.uuid4()}",
        "executionKind": profile["executionKind"],
        "test_fixture_only": profile["testFixtureOnly"],
        "status": "SUCCEEDED",
        "reason": None,
        "demoSha256": profile["sha"],
        "demoSizeBytes": profile["size"],
        "parserVersion": PARSER_VERSION,
        "parserRevision": PARSER_REVISION,
        "catalogVersion": surface["catalogVersion"],
        "catalogDigest": surface["catalogDigest"],
        "contractVersion": surface["contractVersion"],
        "contractDigest": surface["contractDigest"],
        "canonicalContract": {
            "version": canonical.CANONICAL_CONTRACT_VERSION,
            "digest": canonical.CANONICAL_CONTRACT_DIGEST,
        },
        "artifactIdentity": None,
        "environmentFingerprint": {
            "pythonVersion": platform.python_version(),
            "platform": platform.platform(),
        },
        "apiCalls": api_calls,
        "fieldInventory": sample(fields),
        "eventInventory": sample(inventory, 1024),
        "eventInventoryDigest": digest(inventory),
        **build_semantic_evidence(
            header=header,
            events=events,
            grenades=grenade_summary,
            ticks=tick_summary,
            tick_probe=tick_probe,
            requested_fields=requested_fields,
            wanted_ticks=wanted_ticks,
        ),
        "playerInventory": {"status": "AVAILABLE_ON_PYTHON", "value": player_summary},
        "domainAvailability": {
            "players": "AVAILABLE",
            "player_identity": "AVAILABLE",
        },
        # Private, non-semantic diagnostics (block digests, bounded samples).
        # Used only to localize a divergence; never hashed into any gate digest.
        "tableDiagnostics": table_diagnostics,
        "normalizedResult": normalized_result,
        "normalizedResultDigest": digest(normalized_result),
        "resultDigest": digest(normalized_result),
        "rawDigest": digest(
            [
                {"api": item["api"], "eventName": item.get("eventName"), "digest": item["outputDigest"]}
                for item in api_calls
            ]
        ),
        "eventDigest": digest(events),
        "tickDigest": tick_summary["tableDigest"],
        "roundDigest": digest(by_name(lambda name: name.startswith("round_"))),
        "playerDigest": player_summary["tableDigest"],
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
