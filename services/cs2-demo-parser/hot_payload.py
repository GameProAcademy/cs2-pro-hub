"""Bounded semantic payload sent from the durable parser to the APP."""
from __future__ import annotations

import math
import json
from typing import Any

HOT_SCHEMA_VERSION = 1
HOT_LIMITS = {
    "players": 64,
    "rounds": 256,
    "combat_events": 50_000,
    "utility_events": 20_000,
    "objective_events": 4_096,
    "aim_observations": 4_096,
    "position_snapshots": 4_096,
    "economy_snapshots": 4_096,
    "warnings": 128,
}

_COMBAT = {"player_death", "player_hurt", "weapon_fire", "weapon_fire_on_empty"}
_UTILITY = {"player_blind", "flashbang_detonate", "smokegrenade_detonate", "smokegrenade_expired", "molotov_detonate", "inferno_startburn", "inferno_expire", "hegrenade_detonate", "decoy_detonate", "grenade_thrown"}
_OBJECTIVE = {"bomb_planted", "bomb_defused", "bomb_exploded", "bomb_beginplant", "bomb_begindefuse", "round_start", "round_end"}
_CLASSIFIED = _COMBAT | _UTILITY | _OBJECTIVE


def _bounded(name: str, rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    limit = HOT_LIMITS[name]
    kept = rows[:limit]
    return kept, {
        "status": "limited" if len(rows) > limit else "complete",
        "observed_rows": len(rows),
        "included_rows": len(kept),
        "limit": limit,
        "overflow_rows": max(0, len(rows) - limit),
    }


def _unavailable(name: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return [], {
        "status": "unavailable",
        "observed_rows": 0,
        "included_rows": 0,
        "limit": HOT_LIMITS[name],
        "overflow_rows": 0,
    }


def _finite(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(float(value)) else None


def _integer(value: Any, *, positive: bool = False) -> int | None:
    number = _finite(value)
    if number is None or not float(number).is_integer():
        return None
    result = int(number)
    return result if not positive or result > 0 else None


def _text(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    text = str(value).strip()
    return text or None


def _put(row: dict[str, Any], key: str, value: Any) -> None:
    if value is not None:
        row[key] = value


def _json_value(value: Any) -> Any:
    """Keep parser-native structure while making HOT strict-JSON safe."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    scalar = getattr(value, "item", None)
    if callable(scalar):
        try:
            return _json_value(scalar())
        except Exception:
            return None
    return str(value)


def hot_payload_measurements(hot: dict[str, Any]) -> dict[str, Any]:
    """Deterministic compact telemetry; never includes RAW values."""
    sections = {}
    for name in HOT_LIMITS:
        value = hot.get(name) or []
        sections[name] = {
            "rows": len(value),
            "bytes": len(json.dumps(_json_value(value), sort_keys=True, separators=(",", ":"),
                                    ensure_ascii=False, allow_nan=False).encode("utf-8")),
        }
    total = len(json.dumps(_json_value(hot), sort_keys=True, separators=(",", ":"),
                           ensure_ascii=False, allow_nan=False).encode("utf-8"))
    return {"hot_payload_bytes": total, "sections": sections}


def _tick_context(source: dict[str, Any]) -> dict[str, Any]:
    row: dict[str, Any] = {}
    _put(row, "player", _text(source.get("player_steamid", source.get("steamid"))))
    _put(row, "tick", _integer(source.get("tick")))
    _put(row, "round", _integer(source.get("total_rounds_played", source.get("round")), positive=True))
    _put(row, "time_seconds", _finite(source.get("game_time")))
    team_num = _integer(source.get("team_num", source.get("team_number")))
    _put(row, "side", "T" if team_num == 2 else "CT" if team_num == 3 else None)
    return row


def _semantic_tick_rows(evidence: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    groups = {"aim_observations": [], "position_snapshots": [], "economy_snapshots": []}
    for source in evidence.get("tick_samples") or []:
        if not isinstance(source, dict):
            continue
        context = _tick_context(source)

        aim = dict(context)
        for key in ("pitch", "yaw", "shots_fired", "health", "armor_value"):
            _put(aim, key, _finite(source.get(key)))
        for key in ("is_scoped",):
            _put(aim, key, source.get(key) if isinstance(source.get(key), bool) else None)
        for key in ("active_weapon", "active_weapon_name", "aim_punch_angle", "aim_punch_angle_vel"):
            _put(aim, key, _json_value(source.get(key)))
        if any(key not in context for key in aim):
            groups["aim_observations"].append(aim)

        position = dict(context)
        for source_key, target_key in (("X", "x"), ("Y", "y"), ("Z", "z"),
                                       ("velocity", "velocity"), ("velocity_X", "velocity_x"),
                                       ("velocity_Y", "velocity_y"), ("velocity_Z", "velocity_z")):
            _put(position, target_key, _finite(source.get(source_key)))
        for key in ("last_place_name", "move_state"):
            _put(position, key, _text(source.get(key)))
        for key in ("is_alive", "is_airborne", "is_strafing", "is_walking", "ducked", "ducking"):
            _put(position, key, source.get(key) if isinstance(source.get(key), bool) else None)
        if any(key not in context for key in position):
            groups["position_snapshots"].append(position)

        economy = dict(context)
        for key in ("balance", "start_balance", "total_cash_spent", "cash_spent_this_round",
                    "round_start_equip_value", "current_equip_value"):
            _put(economy, key, _finite(source.get(key)))
        for key in ("weapon_purchases_this_round", "weapon_purchases_this_match"):
            _put(economy, key, _json_value(source.get(key)))
        if any(key not in context for key in economy):
            groups["economy_snapshots"].append(economy)
    return groups


def build_hot_payload(parsed: dict[str, Any], *, parser: dict[str, Any], contract_version: int,
                      demo_sha256: str, upload_id: str,
                      evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    events = [row for row in parsed.get("events") or [] if isinstance(row, dict)]
    groups = {
        "combat_events": [row for row in events if row.get("type") in _COMBAT],
        "utility_events": [row for row in events if row.get("type") in _UTILITY],
        "objective_events": [row for row in events if row.get("type") in _OBJECTIVE],
    }
    unclassified_events = sum(1 for row in events if row.get("type") not in _CLASSIFIED)
    players, player_quality = _bounded("players", list(parsed.get("players") or []))
    rounds, round_quality = _bounded("rounds", list(parsed.get("rounds") or []))
    warnings, warning_quality = _bounded("warnings", [{"value": str(v)} for v in parsed.get("warnings") or []])
    quality = {"players": player_quality, "rounds": round_quality, "warnings": warning_quality}
    bounded_groups: dict[str, list[dict[str, Any]]] = {}
    for name, rows in groups.items():
        bounded_groups[name], quality[name] = _bounded(name, rows)
    semantic_rows = _semantic_tick_rows(evidence or {})
    for name, rows in semantic_rows.items():
        if rows:
            bounded_groups[name], quality[name] = _bounded(name, rows)
        else:
            bounded_groups[name], quality[name] = _unavailable(name)
    limited = sorted(name for name, item in quality.items() if item["status"] == "limited")
    partial = bool(unclassified_events or limited or any(
        item["status"] in {"not_implemented", "unavailable"} for item in quality.values()
    ))
    return {
        "schema_version": HOT_SCHEMA_VERSION,
        "parser": parser,
        "contract_version": contract_version,
        "demo": {"sha256": demo_sha256.lower(), "upload_id": upload_id},
        "header": parsed.get("header") or {},
        "players": players,
        "rounds": rounds,
        **bounded_groups,
        "quality": {"partial": partial,
                    "limited_sections": limited, "sections": quality,
                    "unclassified_event_rows": unclassified_events},
        "provenance": {"source": "demo", "raw_artifact_required": True},
        "warnings": [item["value"] for item in warnings],
    }
