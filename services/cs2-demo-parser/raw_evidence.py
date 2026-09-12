"""Raw demo evidence and coverage, kept separate from the APP/canonical contract."""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Iterable, Sequence

EVIDENCE_VERSION = 1
TICK_SAMPLE_LIMIT = 2048

EVENT_CANDIDATES: tuple[str, ...] = (
    "bomb_beep", "bomb_begindefuse", "bomb_beginplant", "bomb_defused", "bomb_exploded",
    "bomb_planted", "decoy_detonate", "flashbang_detonate", "grenade_thrown",
    "hegrenade_detonate", "inferno_expire", "item_pickup", "item_purchase", "item_remove",
    "molotov_detonate", "player_blind", "player_death", "player_hurt", "player_spawned",
    "player_team", "round_end", "round_start", "smokegrenade_expired",
    "smokegrenade_detonate", "weapon_fire", "weapon_fire_on_empty", "weapon_reload",
    "weapon_zoom", "weapon_zoom_rifle",
)

PLAYER_PROPERTIES: tuple[str, ...] = (
    "X", "Y", "Z", "active_weapon", "armor_value", "balance", "buttons",
    "cash_spent_this_round", "current_equip_value", "death_time", "ducked", "ducking",
    "flash_duration", "game_time", "has_defuser", "has_helmet", "health", "in_bomb_zone",
    "in_buy_zone", "is_airborne", "is_alive", "is_defusing", "is_scoped", "is_walking",
    "last_place_name", "life_state", "mvps", "ping", "pitch", "player_name",
    "player_steamid", "round_start_equip_value", "score", "shots_fired", "spawn_time",
    "start_balance", "team_num", "total_cash_spent", "velocity", "velocity_X", "velocity_Y",
    "velocity_Z", "weapon_purchases_this_match", "weapon_purchases_this_round", "yaw",
)

MAPPED_RAW_FIELDS: dict[str, tuple[str | None, str | None, str]] = {
    "header.map_name": ("header.map", "CanonicalMatch.map", "MAPPED"),
    "header.demo_version_name": ("header.game_version", "CanonicalMatch.gameVersion", "MAPPED"),
    "header.playback_ticks_per_second": ("header.tickrate", "CanonicalMatch.tickrate", "MAPPED"),
    "player.steamid": ("players[].steam_id", "CanonicalPlayer.steamId", "MAPPED"),
    "player.name": ("players[].name", "CanonicalPlayer.name", "MAPPED"),
    "player.team_number": ("players[].side", "CanonicalPlayer.side", "MAPPED"),
    "round_start.tick": ("rounds[].start_tick", "CanonicalRound.startTick", "DERIVED"),
    "round_end.tick": ("rounds[].end_tick", "CanonicalRound.endTick", "DERIVED"),
    "round_end.winner": ("rounds[].winner_side", "CanonicalRound.winnerSide", "MAPPED"),
    "player_death.attacker_steamid": ("events[].attacker", "CanonicalEvent.actorSteamId", "MAPPED"),
    "player_death.user_steamid": ("events[].victim", "CanonicalEvent.victimSteamId", "MAPPED"),
    "player_death.assister_steamid": ("events[].assister", "CanonicalEvent.assisterSteamId", "MAPPED"),
    "player_death.weapon": ("events[].weapon", "CanonicalEvent.weapon", "MAPPED"),
    "player_death.headshot": ("events[].headshot", "CanonicalEvent.headshot", "MAPPED"),
    "player_hurt.dmg_health": ("events[].damage", "CanonicalEvent.damage", "MAPPED"),
    "player_blind.blind_duration": ("events[].flash_duration", "CanonicalEvent.data.flash_duration", "MAPPED"),
}


def _safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): _safe(v) for k, v in sorted(value.items(), key=lambda item: str(item[0]))}
    if isinstance(value, (list, tuple)):
        return [_safe(v) for v in value]
    item = getattr(value, "item", None)
    if callable(item):
        try:
            return _safe(item())
        except Exception:
            return None
    return str(value)


def stable_json(value: Any) -> str:
    return json.dumps(_safe(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def evidence_digest(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode("utf-8")).hexdigest()


def _int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        return None
    return int(value) if float(value).is_integer() else None


def _num(value: Any) -> float | int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        return None
    return value


def _records(frame: Any) -> list[dict[str, Any]]:
    if frame is None:
        return []
    if isinstance(frame, list):
        return [_safe(row) for row in frame if isinstance(row, dict)]
    to_dict = getattr(frame, "to_dict", None)
    if callable(to_dict):
        return [_safe(row) for row in to_dict(orient="records") if isinstance(row, dict)]
    return []


def _range(rows: Sequence[dict[str, Any]], field: str) -> tuple[int | None, int | None]:
    values = sorted(v for v in (_int(row.get(field)) for row in rows) if v is not None)
    return (values[0], values[-1]) if values else (None, None)


def safe_error(exc: BaseException) -> tuple[str, str]:
    import re
    message = " ".join(str(exc).split())
    message = re.sub(r"(?:[A-Za-z]:)?[/\\][^\s]+", "[path]", message)
    message = re.sub(r"(?i)bearer\s+[A-Za-z0-9._~-]+", "Bearer [redacted]", message)[:240]
    return type(exc).__name__, message or "Parser capability failed without a message."


def field_coverage(rows: Sequence[dict[str, Any]], properties: Iterable[str]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    total = len(rows)
    for prop in sorted(set(properties)):
        values = [row.get(prop) for row in rows if prop in row and row.get(prop) is not None]
        numeric = [float(v) for v in values if _num(v) is not None]
        first_tick, last_tick = _range([row for row in rows if row.get(prop) is not None], "tick")
        result.append({
            "property": prop,
            "available": bool(values),
            "rows": len(values),
            "null_percent": round(((total - len(values)) / total) * 100, 3) if total else None,
            "min": min(numeric) if numeric else None,
            "max": max(numeric) if numeric else None,
            "sample": _safe(values[0]) if values else None,
            "first_tick": first_tick, "last_tick": last_tick,
            "success": True, "error": None,
        })
    return result


def event_coverage(name: str, available: bool, rows: Sequence[dict[str, Any]] | None,
                   error: BaseException | None = None) -> dict[str, Any]:
    safe_rows = list(rows or [])
    first_tick, last_tick = _range(safe_rows, "tick")
    rounds = [r for row in safe_rows for r in [_int(row.get("round") or row.get("total_rounds_played"))] if r is not None]
    all_fields = {str(key) for row in safe_rows for key in row}
    fields = sorted({str(key) for row in safe_rows for key, value in row.items() if value is not None})
    missing_fields = sorted(
        field for field in all_fields if any(row.get(field) is None for row in safe_rows)
    )
    error_type, error_message = safe_error(error) if error else (None, None)
    return {
        "event_name": name, "available": available, "parse_attempted": available or error is not None,
        "parse_success": available and error is None, "row_count": len(safe_rows) if error is None and available else None,
        "first_tick": first_tick, "last_tick": last_tick,
        "first_round": min(rounds) if rounds else None, "last_round": max(rounds) if rounds else None,
        "fields_available": fields, "fields_missing": missing_fields, "error_type": error_type,
        "error_message_safe": error_message,
    }


def raw_events(event_tables: dict[str, Sequence[dict[str, Any]] | None]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for name in sorted(event_tables):
        for index, row in enumerate(event_tables[name] or []):
            tick = _int(row.get("tick"))
            round_number = _int(row.get("round") or row.get("total_rounds_played"))
            time_seconds = _num(row.get("time_seconds") or row.get("game_time"))
            result.append({
                "event_name": name, "tick": tick, "round": round_number,
                "time_seconds": time_seconds, "raw_fields": _safe(row),
                "parser_source": f"parse_event:{name}", "source_index": index,
            })
    return sorted(result, key=lambda row: (row["event_name"], row["tick"] if row["tick"] is not None else -1, row["source_index"]))


def mapping_inventory(raw: dict[str, Any]) -> list[dict[str, Any]]:
    observed: set[str] = set()
    for key in (raw.get("header") or {}): observed.add(f"header.{key}")
    for row in raw.get("players") or []:
        for key in row: observed.add(f"player.{key}")
    for name, rows in (raw.get("event_tables") or {}).items():
        for row in rows or []:
            for key in row: observed.add(f"{name}.{key}")
    result = []
    for field in sorted(observed):
        app_field, canonical_field, status = MAPPED_RAW_FIELDS.get(field, (None, None, "UNMAPPED_BUT_AVAILABLE"))
        result.append({"raw_field": field, "app_field": app_field, "canonical_field": canonical_field, "status": status, "reason": None})
    return result


def build_manifest(raw: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    header = raw.get("header") or {}
    ticks = [v for rows in (raw.get("event_tables") or {}).values() for row in (rows or []) for v in [_int(row.get("tick"))] if v is not None]
    return {
        "parser_name": None, "parser_version": None, "parser_revision": None, "contract_version": None,
        "demo_sha256": None, "file_size": None,
        "map": header.get("map_name") or header.get("map"), "patch_version": header.get("patch_version"),
        "build_number": header.get("build_number"), "demo_version_name": header.get("demo_version_name"),
        "demo_version_guid": header.get("demo_version_guid"), "demo_file_stamp": header.get("demo_file_stamp"),
        "server_name": header.get("server_name"), "client_name": header.get("client_name"),
        "game_directory": header.get("game_directory"),
        "tickrate": output.get("header", {}).get("tickrate"), "playback_ticks": header.get("playback_ticks"),
        "playback_time": header.get("playback_time"), "playback_frames": header.get("playback_frames"),
        "players_count": len(output.get("players") or []), "rounds_count": len(output.get("rounds") or []),
        "events_count": sum(len(rows or []) for rows in (raw.get("event_tables") or {}).values()),
        "event_inventory_success": raw.get("event_inventory_error") is None,
        "event_inventory_count": len(raw.get("event_inventory") or []),
        "first_tick": min(ticks) if ticks else None,
        "last_tick": max(ticks) if ticks else None, "warnings": list(output.get("warnings") or []),
        "partial_parse": any("partial" in str(w).lower() for w in output.get("warnings") or []),
        "extraction_confidence": None,
    }


def build_gates(evidence: dict[str, Any]) -> list[dict[str, Any]]:
    manifest = evidence["manifest"]
    events = evidence["event_coverage"]
    mappings = evidence["field_mappings"]
    def gate(name: str, passed: bool, reasons: list[str]) -> dict[str, Any]:
        return {"gate": name, "status": "PASS" if passed else "FAIL", "reasons": reasons}
    event_ok = (
        bool(events)
        and manifest.get("event_inventory_success") is True
        and all(item["parse_success"] for item in events if item["available"])
        and not any(item["parse_attempted"] and not item["parse_success"] for item in events)
    )
    player_ok = manifest["players_count"] > 0 and bool(evidence["player_coverage"])
    round_ok = manifest["rounds_count"] > 0
    tick_tested = bool(evidence["tick_coverage"]) and all(
        item.get("success", True) for item in evidence["tick_coverage"]
    )
    grenade_tested = bool(evidence["grenade_coverage"]) and all(
        item.get("success", True) for item in evidence["grenade_coverage"]
    )
    economy_tested = bool(evidence["economy_coverage"]) and any(
        item.get("available") for item in evidence["economy_coverage"]
    )
    mapping_ok = bool(mappings) and all(item["status"] for item in mappings)
    core_ok = all([manifest.get("demo_sha256"), manifest.get("parser_name"), manifest.get("parser_version"), event_ok, player_ok, round_ok, tick_tested, grenade_tested, economy_tested, mapping_ok])
    return [
        gate("RAW-EVIDENCE-01", bool(core_ok), [] if core_ok else ["required evidence capability is missing or failed"]),
        gate("EVENT-COVERAGE", event_ok, [] if event_ok else ["event inventory was not fully tested"]),
        gate("PLAYER-COVERAGE", player_ok, [] if player_ok else ["player inventory or field coverage is absent"]),
        gate("ROUND-COVERAGE", round_ok, [] if round_ok else ["round inventory is absent"]),
        gate("ECONOMY-COVERAGE", economy_tested, [] if economy_tested else ["economy properties were not tested"]),
        gate("TICK-COVERAGE", tick_tested, [] if tick_tested else ["parse_ticks capability was not tested"]),
        gate("GRENADE-COVERAGE", grenade_tested, [] if grenade_tested else ["parse_grenades capability was not tested"]),
        gate("RAW→CANONICAL", mapping_ok, [] if mapping_ok else ["raw fields are not catalogued"]),
    ]


def finalize_evidence(evidence: dict[str, Any], *, parser: dict[str, Any], contract_version: int,
                      demo_sha256: str, file_size: int) -> dict[str, Any]:
    manifest = evidence["manifest"]
    manifest.update({"parser_name": parser.get("name"), "parser_version": parser.get("version"),
                     "parser_revision": parser.get("revision"), "contract_version": contract_version,
                     "demo_sha256": demo_sha256.lower(), "file_size": file_size})
    evidence["gates"] = build_gates(evidence)
    clean = _safe(evidence)
    clean["deterministic_digest"] = evidence_digest(clean)
    return clean
