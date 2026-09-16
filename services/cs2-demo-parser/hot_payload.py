"""Bounded semantic payload sent from the durable parser to the APP."""
from __future__ import annotations

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


def build_hot_payload(parsed: dict[str, Any], *, parser: dict[str, Any], contract_version: int,
                      demo_sha256: str, upload_id: str) -> dict[str, Any]:
    events = [row for row in parsed.get("events") or [] if isinstance(row, dict)]
    groups = {
        "combat_events": [row for row in events if row.get("type") in _COMBAT],
        "utility_events": [row for row in events if row.get("type") in _UTILITY],
        "objective_events": [row for row in events if row.get("type") in _OBJECTIVE],
        "aim_observations": [],
        "position_snapshots": [],
        "economy_snapshots": [],
    }
    players, player_quality = _bounded("players", list(parsed.get("players") or []))
    rounds, round_quality = _bounded("rounds", list(parsed.get("rounds") or []))
    warnings, warning_quality = _bounded("warnings", [{"value": str(v)} for v in parsed.get("warnings") or []])
    quality = {"players": player_quality, "rounds": round_quality, "warnings": warning_quality}
    bounded_groups: dict[str, list[dict[str, Any]]] = {}
    for name, rows in groups.items():
        bounded_groups[name], quality[name] = _bounded(name, rows)
    limited = sorted(name for name, item in quality.items() if item["status"] == "limited")
    return {
        "schema_version": HOT_SCHEMA_VERSION,
        "parser": parser,
        "contract_version": contract_version,
        "demo": {"sha256": demo_sha256.lower(), "upload_id": upload_id},
        "header": parsed.get("header") or {},
        "players": players,
        "rounds": rounds,
        **bounded_groups,
        "quality": {"partial": bool(limited), "limited_sections": limited, "sections": quality},
        "provenance": {"source": "demo", "raw_artifact_required": True},
        "warnings": [item["value"] for item in warnings],
    }
