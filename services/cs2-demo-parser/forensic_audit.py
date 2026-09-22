"""Bounded-memory forensic inventory helpers for audit contract v2."""
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable

AUDIT_CONTRACT_VERSION = 2
TICK_PROPERTY_BATCH_SIZE = 12
TICK_INTERVAL_SIZE = 8192
TICK_DIAGNOSTIC_SAMPLE_LIMIT = 4096
CLASSIFICATIONS = frozenset({"CANONICAL", "DERIVED", "RAW_ONLY", "NOT_PRESENT", "UNAVAILABLE", "PARSE_FAILED"})
TICK_AUTHORITY_STATES = frozenset({"UNAVAILABLE", "OBSERVED_ONLY", "PROVISIONAL", "VERIFIED"})
REAL_AUTHORITY_KINDS = frozenset({"VERIFIED_RUNTIME_NATIVE", "VERIFIED_DEMO_METADATA", "VERIFIED_EXTERNAL_METADATA"})


@dataclass(frozen=True)
class TickDomainAuthority:
    status: str
    authority_type: str
    authority_source: str
    demo_sha256: str | None
    parser_revision: str
    tickrate: float | None
    authoritative: bool
    expected_min_tick: int | None
    expected_max_tick: int | None
    expected_tick_count: int | None
    expected_intervals: tuple[tuple[int, int], ...]
    coverage_digest: str | None
    created_at: str | None
    reason: str

    def payload(self) -> dict[str, Any]:
        value = {**self.__dict__, "expected_intervals": [list(row) for row in self.expected_intervals]}
        value.update({
            "min_tick": self.expected_min_tick,
            "max_tick": self.expected_max_tick,
            "intervals": value["expected_intervals"],
        })
        value["authority_digest"] = deterministic_digest(value)
        value["digest"] = value["authority_digest"]
        return value


def classify_capability_failure(*, api_available: bool, attempted: bool,
                                stage: str, error: BaseException | None = None) -> dict[str, Any]:
    kind = "UNAVAILABLE" if not api_available else "PARSE_FAILED" if attempted and error else "NOT_PRESENT"
    return {"classification": kind, "failure_kind": kind, "failure_stage": stage,
            "exception_type": type(error).__name__ if error else None,
            "exception_message_safe": " ".join(str(error).split())[:240] if error else None,
            "api_available": api_available, "attempted": attempted}


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
    props = sorted(set(properties)); stats = {p: {"rows": 0, "returned": 0, "non_null": 0, "null": 0, "types": Counter(), "distinct": set(), "first": None, "last": None, "min": None, "max": None, "players": set(), "first_tick": None, "last_tick": None} for p in props}
    for row in rows:
        tick = row.get("tick"); player = row.get("steamid", row.get("player_steamid"))
        for prop in props:
            s = stats[prop]; s["rows"] += 1
            if prop in row: s["returned"] += 1
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
        classification = "PARSE_FAILED" if error else "NOT_PRESENT" if s["returned"] == 0 else "RAW_ONLY"
        out.append({"property": prop, "attempted": attempted, "api_available": True, "parse_success": error is None, "row_count": s["rows"], "returned_count": s["returned"], "non_null_count": s["non_null"], "null_count": s["null"], "null_only": s["returned"] > 0 and s["non_null"] == 0, "distinct_count": len(s["distinct"]), "first_non_null_value": s["first"], "last_non_null_value": s["last"], "type_signature": sorted(s["types"]), "min": s["min"], "max": s["max"], "players_observed": sorted(s["players"]), "first_tick": s["first_tick"], "last_tick": s["last_tick"], "classification": classification, "reason": "Observed parser-native field retained in RAW." if classification == "RAW_ONLY" else "Known capability absent from this demo." if classification == "NOT_PRESENT" else "Parser raised while querying this capability.", "failure_kind": "PARSE_FAILED" if error else None, "failure_stage": "parse_ticks", "error_type": error_type, "error_message": error_message, "provenance": "demoparser2.parse_ticks"})
    return out


def merge_property_summaries(parts: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge interval summaries without retaining their source rows."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for part in parts:
        grouped.setdefault(str(part.get("property")), []).append(part)
    merged: list[dict[str, Any]] = []
    for prop, rows in sorted(grouped.items()):
        failures = [row for row in rows if row.get("classification") == "PARSE_FAILED"]
        unavailable = rows and all(row.get("classification") == "UNAVAILABLE" for row in rows)
        non_null = sum(int(row.get("non_null_count") or 0) for row in rows)
        classification = "PARSE_FAILED" if failures else "UNAVAILABLE" if unavailable else "NOT_PRESENT" if non_null == 0 else "RAW_ONLY"
        numeric_mins = [row["min"] for row in rows if isinstance(row.get("min"), (int, float))]
        numeric_maxs = [row["max"] for row in rows if isinstance(row.get("max"), (int, float))]
        first_ticks = [row["first_tick"] for row in rows if isinstance(row.get("first_tick"), int)]
        last_ticks = [row["last_tick"] for row in rows if isinstance(row.get("last_tick"), int)]
        players = sorted({str(player) for row in rows for player in row.get("players_observed") or []})
        merged.append({
            "property": prop,
            "attempted": any(row.get("attempted") is True for row in rows),
            "parse_success": not failures and not unavailable,
            "row_count": sum(int(row.get("row_count") or 0) for row in rows),
            "returned_count": sum(int(row.get("returned_count") or 0) for row in rows),
            "non_null_count": non_null,
            "null_count": sum(int(row.get("null_count") or 0) for row in rows),
            "distinct_count": None,
            "first_non_null_value": next((row.get("first_non_null_value") for row in rows if row.get("first_non_null_value") is not None), None),
            "last_non_null_value": next((row.get("last_non_null_value") for row in reversed(rows) if row.get("last_non_null_value") is not None), None),
            "type_signature": sorted({kind for row in rows for kind in row.get("type_signature") or []}),
            "min": min(numeric_mins) if numeric_mins else None,
            "max": max(numeric_maxs) if numeric_maxs else None,
            "players_observed": players[:128],
            "distinct_player_count": len(players),
            "first_tick": min(first_ticks) if first_ticks else None,
            "last_tick": max(last_ticks) if last_ticks else None,
            "classification": classification,
            "null_only": classification == "RAW_ONLY" and non_null == 0,
            "reason": "Observed parser-native field retained in RAW." if classification == "RAW_ONLY" else "Known capability absent from this demo." if classification == "NOT_PRESENT" else "Parser raised while querying this capability." if classification == "PARSE_FAILED" else "Capability could not be audited by the installed runtime.",
            "error_type": next((row.get("error_type") for row in rows if row.get("error_type")), None),
            "error_message": next((row.get("error_message") for row in rows if row.get("error_message")), None),
            "provenance": "demoparser2.parse_ticks",
            "interval_digest": deterministic_digest([row.get("interval_digest") for row in rows]),
        })
    return merged


def build_tick_domain_source(playback_ticks: int | None) -> dict[str, Any]:
    """Describe, but never overstate, the 0.42.0 source for an expected domain.

    The installed package exposes ``parse_ticks(..., ticks=...)`` but no public
    API that independently enumerates every valid demo tick. ``playback_ticks``
    is not part of the documented 0.42.0 ``parse_header`` contract, so it is
    retained as an observation and cannot authorize a full-domain claim.
    """
    source = TickDomainAuthority("UNAVAILABLE", "UNAVAILABLE", "demoparser2.parse_header.playback_ticks",
        None, "demoparser2@0.42.0", None, False, None, None, None, (), None, None,
        "demoparser2 0.42.0 exposes no independent documented complete tick-domain enumeration").payload()
    source["observed_playback_ticks"] = playback_ticks
    unsigned = {key: value for key, value in source.items() if key not in {"digest", "authority_digest"}}
    source["authority_digest"] = deterministic_digest(unsigned)
    source["digest"] = source["authority_digest"]
    return source


def authoritative_tick_domain(first_tick: int, last_tick: int, *, provenance: str,
                              demo_sha256: str | None = None, tickrate: float | None = None,
                              parser_revision: str = "demoparser2@0.42.0",
                              created_at: str | None = None) -> dict[str, Any]:
    """Build a domain claim; fixtures remain PROVISIONAL and cannot pass production gates."""
    if first_tick < 0 or last_tick < first_tick:
        raise ValueError("invalid authoritative tick domain")
    fixture = provenance.startswith("fixture")
    authority_type = "TEST_FIXTURE_ONLY" if fixture else "VERIFIED_RUNTIME_NATIVE"
    coverage_digest = deterministic_digest({"min_tick": first_tick, "max_tick": last_tick,
                                             "intervals": [[first_tick, last_tick]]})
    return TickDomainAuthority("PROVISIONAL" if fixture else "VERIFIED", authority_type,
        provenance, demo_sha256, parser_revision, tickrate, not fixture,
        first_tick, last_tick, last_tick - first_tick + 1, ((first_tick, last_tick),),
        coverage_digest, created_at,
        "TEST_FIXTURE_ONLY: exercises gate mechanics and is never real evidence." if fixture else "Verified independent runtime domain.").payload()


def build_tick_intervals(source: dict[str, Any], interval_size: int = TICK_INTERVAL_SIZE) -> list[tuple[int, int]]:
    if source.get("status") not in {"PROVISIONAL", "VERIFIED"} or interval_size <= 0:
        return []
    first = source.get("expected_min_tick"); last = source.get("expected_max_tick")
    if not isinstance(first, int) or not isinstance(last, int) or first < 0 or last < first:
        return []
    return [(start, min(last, start + interval_size - 1)) for start in range(first, last + 1, interval_size)]


def build_tick_coverage(*, batches: list[dict[str, Any]], playback_ticks: int | None = None,
                        tick_domain_source: dict[str, Any] | None = None) -> dict[str, Any]:
    source = tick_domain_source or build_tick_domain_source(playback_ticks)
    intervals=[]; rows=0; observed=set(); players=set(); properties=set(); failures=[]
    duplicate_ticks: set[int] = set(); interval_keys: set[tuple[int, int, tuple[str, ...]]] = set()
    overlaps: list[dict[str, Any]] = []
    for index, batch in enumerate(batches):
        batch_ticks = [tick for tick in (batch.get("ticks") or []) if isinstance(tick, int)]
        batch_tick_set = set(batch_ticks); observed.update(batch_tick_set)
        duplicate_ticks.update(tick for tick, count in Counter(batch_ticks).items() if count > 1)
        rows += int(batch.get("row_count") or 0); players.update(batch.get("players") or []); properties.update(batch.get("properties") or [])
        error = batch.get("error")
        if error: failures.append(str(error))
        requested = batch.get("requested_interval")
        key = None
        if isinstance(requested, (list, tuple)) and len(requested) == 2 and all(isinstance(v, int) for v in requested):
            key = (requested[0], requested[1], tuple(sorted(batch.get("properties") or [])))
            if key in interval_keys: overlaps.append({"batch": index, "requested_interval": list(requested), "reason": "duplicate_property_interval"})
            interval_keys.add(key)
            outside = sorted(t for t in batch_tick_set if t < requested[0] or t > requested[1])
            if outside: overlaps.append({"batch": index, "unexpected_ticks": outside[:256], "total": len(outside)})
        intervals.append({"batch": index, "properties": sorted(batch.get("properties") or []), "requested_interval": list(requested) if key else None, "first_tick": min(batch_tick_set) if batch_tick_set else None, "last_tick": max(batch_tick_set) if batch_tick_set else None, "distinct_ticks": len(batch_tick_set), "rows": int(batch.get("row_count") or 0), "digest": deterministic_digest({"properties": sorted(batch.get("properties") or []), "requested_interval": requested, "ticks": sorted(batch_tick_set), "rows": int(batch.get("row_count") or 0)}), "status": "FAIL" if error else "PASS"})
    expected: set[int] = set()
    if source.get("status") in {"PROVISIONAL", "VERIFIED"}:
        first = source.get("expected_min_tick"); last = source.get("expected_max_tick")
        if isinstance(first, int) and isinstance(last, int) and last >= first:
            expected = set(range(first, last + 1))
    missing = expected - observed
    unexpected = observed - expected if expected else set(observed)
    invalid_ticks = sorted(tick for tick in observed if tick < 0)
    ordered_ticks = [tick for batch in batches for tick in (batch.get("ticks") or []) if isinstance(tick, int)]
    out_of_order = sum(left > right for left, right in zip(ordered_ticks, ordered_ticks[1:]))
    authority_allowed = source.get("status") == "VERIFIED" and source.get("authority_type") in REAL_AUTHORITY_KINDS
    complete = bool(batches) and bool(expected) and source.get("authoritative") is True and authority_allowed and not failures and not missing and not unexpected and not duplicate_ticks and not overlaps and not invalid_ticks and out_of_order == 0 and all(item["status"] == "PASS" for item in intervals)
    proof = {
        "status": "PASS" if complete else "BLOCKED",
        "source": source,
        "expected_min_tick": min(expected) if expected else None,
        "expected_max_tick": max(expected) if expected else None,
        "expected_tick_count": len(expected) if expected else None,
        "observed_tick_count": len(observed),
        "missing_tick_count": len(missing),
        "unexpected_tick_count": len(unexpected),
        "duplicate_tick_count": len(duplicate_ticks),
        "gap_count": len(missing),
        "overlap_count": len(overlaps),
        "out_of_order_tick_count": out_of_order,
        "invalid_tick_count": len(invalid_ticks),
        "interval_count": len(intervals),
        "completed_interval_count": sum(item["status"] == "PASS" for item in intervals),
        "coverage_ratio": len(observed & expected) / len(expected) if expected else 0.0,
        "complete": complete,
    }
    proof["digest"] = deterministic_digest(proof)
    authority_failures = [] if authority_allowed else ["verified_independent_tick_authority_required"]
    if not expected:
        authority_failures.insert(0, "expected_tick_domain_unavailable")
    return {"coverage": "FULL_TICK_DOMAIN_AUDIT" if complete else "BLOCKED", "method": "demoparser2.parse_ticks PROPERTY_BATCH x explicit TICK_INTERVAL", "tick_domain_source": source, "full_tick_domain_proof": proof, "expected_tick_domain": {"min_tick": proof["expected_min_tick"], "max_tick": proof["expected_max_tick"], "count": proof["expected_tick_count"]}, "observed_tick_domain": {"min_tick": min(observed) if observed else None, "max_tick": max(observed) if observed else None, "count": len(observed)}, "missing_ticks": sorted(missing)[:4096], "missing_tick_count": len(missing), "unexpected_ticks": sorted(unexpected)[:4096], "unexpected_tick_count": len(unexpected), "duplicate_ticks": sorted(duplicate_ticks)[:4096], "duplicate_tick_count": len(duplicate_ticks), "out_of_order_tick_count": out_of_order, "invalid_ticks": invalid_ticks[:4096], "invalid_tick_count": len(invalid_ticks), "first_tick": min(observed) if observed else None, "last_tick": max(observed) if observed else None, "total_ticks_observed": len(observed), "total_demo_ticks": playback_ticks, "total_rows_audited": rows, "players_observed": sorted(players), "properties_observed": sorted(properties), "batch_count": len(batches), "batches": intervals, "gaps": sorted(missing)[:4096], "gap_count": len(missing), "overlaps": overlaps, "failures": failures + authority_failures, "domain_proof_status": proof["status"], "complete": complete}


def deterministic_digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
