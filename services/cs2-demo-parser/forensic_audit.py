"""Bounded-memory forensic inventory helpers for audit contract v2."""
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from typing import Any, Iterable

AUDIT_CONTRACT_VERSION = 2
TICK_PROPERTY_BATCH_SIZE = 12
TICK_DIAGNOSTIC_SAMPLE_LIMIT = 4096
CLASSIFICATIONS = frozenset({"CANONICAL", "DERIVED", "RAW_ONLY", "NOT_PRESENT", "UNAVAILABLE", "PARSE_FAILED"})


def _safe_scalar(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value): return None
    scalar = getattr(value, "item", None)
    if callable(scalar):
        try: return _safe_scalar(scalar())
        except Exception: return None
    if value is None or isinstance(value, (str, bool, int, float)): return value
    return str(value)[:160]


def type_signature(value: Any) -> str:
    if value is None: return "null"
    if isinstance(value, bool): return "boolean"
    if isinstance(value, int): return "integer"
    if isinstance(value, float): return "number" if math.isfinite(value) else "non_finite"
    if isinstance(value, str): return "string"
    if isinstance(value, list): return "array"
    if isinstance(value, dict): return "object"
    return type(value).__name__


def summarize_rows(rows: Iterable[dict[str, Any]], properties: Iterable[str], *, attempted: bool = True, error: BaseException | None = None) -> list[dict[str, Any]]:
    props = sorted(set(properties)); stats = {p: {"rows": 0, "non_null": 0, "null": 0, "types": Counter(), "distinct": set(), "first": None, "last": None, "min": None, "max": None, "players": set(), "first_tick": None, "last_tick": None} for p in props}
    for row in rows:
        tick = row.get("tick"); player = row.get("steamid", row.get("player_steamid"))
        for prop in props:
            s = stats[prop]; s["rows"] += 1
            value = row.get(prop)
            if value is None: s["null"] += 1; continue
            safe = _safe_scalar(value); s["non_null"] += 1; s["types"][type_signature(value)] += 1
            encoded = json.dumps(safe, sort_keys=True, ensure_ascii=False)
            if len(s["distinct"]) < 1024: s["distinct"].add(encoded[:256])
            if s["first"] is None: s["first"] = safe
            s["last"] = safe
            if isinstance(safe, (int, float)) and not isinstance(safe, bool):
                s["min"] = safe if s["min"] is None else min(s["min"], safe); s["max"] = safe if s["max"] is None else max(s["max"], safe)
            if player is not None and len(s["players"]) < 128: s["players"].add(str(player))
            if isinstance(tick, int): s["first_tick"] = tick if s["first_tick"] is None else min(s["first_tick"], tick); s["last_tick"] = tick if s["last_tick"] is None else max(s["last_tick"], tick)
    error_type = type(error).__name__ if error else None; error_message = " ".join(str(error).split())[:240] if error else None
    out=[]
    for prop in props:
        s=stats[prop]
        classification = "PARSE_FAILED" if error else "NOT_PRESENT" if s["non_null"] == 0 else "RAW_ONLY"
        out.append({"property": prop, "attempted": attempted, "parse_success": error is None, "row_count": s["rows"], "non_null_count": s["non_null"], "null_count": s["null"], "distinct_count": len(s["distinct"]), "first_non_null_value": s["first"], "last_non_null_value": s["last"], "type_signature": sorted(s["types"]), "min": s["min"], "max": s["max"], "players_observed": sorted(s["players"]), "first_tick": s["first_tick"], "last_tick": s["last_tick"], "classification": classification, "reason": "Observed parser-native field retained in RAW." if classification == "RAW_ONLY" else "Known capability absent from this demo." if classification == "NOT_PRESENT" else "Parser raised while querying this capability.", "error_type": error_type, "error_message": error_message, "provenance": "demoparser2.parse_ticks"})
    return out


def build_tick_coverage(*, batches: list[dict[str, Any]], playback_ticks: int | None) -> dict[str, Any]:
    intervals=[]; rows=0; ticks=set(); players=set(); properties=set(); failures=[]
    for index, batch in enumerate(batches):
        batch_ticks=set(batch.get("ticks") or []); ticks.update(batch_ticks); rows += int(batch.get("row_count") or 0); players.update(batch.get("players") or []); properties.update(batch.get("properties") or [])
        if batch.get("error"): failures.append(str(batch["error"]))
        intervals.append({"batch": index, "properties": sorted(batch.get("properties") or []), "first_tick": min(batch_ticks) if batch_ticks else None, "last_tick": max(batch_ticks) if batch_ticks else None, "distinct_ticks": len(batch_ticks), "rows": int(batch.get("row_count") or 0), "status": "FAIL" if batch.get("error") else "PASS"})
    full = bool(batches) and not failures and all(item["status"] == "PASS" for item in intervals)
    return {"coverage": "FULL_TICK_DOMAIN_AUDIT" if full else "SAMPLE_ONLY", "method": "demoparser2.parse_ticks(ticks=None), deterministic property batches", "first_tick": min(ticks) if ticks else None, "last_tick": max(ticks) if ticks else None, "total_ticks_observed": len(ticks), "total_demo_ticks": playback_ticks, "total_rows_audited": rows, "players_observed": sorted(players), "properties_observed": sorted(properties), "batch_count": len(batches), "batches": intervals, "gaps": [], "overlaps": [], "failures": failures, "complete": full}


def deterministic_digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
