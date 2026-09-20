"""Version-locked demoparser2 0.42.0 capability catalogue.

The static catalogue is the reviewed semantic baseline. Runtime discovery from
``list_updated_fields`` and ``list_game_events`` extends it for a concrete demo;
anything discovered outside this baseline is deliberately unclassified and
therefore blocks Canonical admission.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, asdict
from typing import Any, Iterable

PARSER_NAME = "demoparser2"
PARSER_VERSION = "0.42.0"
CATALOG_VERSION = 1
CATALOG_SOURCE = "installed-demoparser2-0.42.0-runtime-surface+runtime-inventories+reviewed-gamepro-mappings"

CLASSIFICATIONS = frozenset({"CANONICAL", "DERIVED", "RAW_ONLY", "NOT_PRESENT", "UNAVAILABLE", "PARSE_FAILED"})

HEADER_FIELDS = (
    "addons", "allow_clientside_entities", "allow_clientside_particles", "client_name",
    "demo_file_stamp", "demo_version_guid", "demo_version_name", "game_directory",
    "map_name", "network_protocol", "server_name", "fullpackets_version", "patch_version",
    "build_number", "playback_ticks", "playback_time", "playback_frames",
    "playback_ticks_per_second",
)
PLAYER_INFO_FIELDS = ("name", "steamid", "team_number")
POSITION_FIELDS = ("X", "Y", "Z")
AIM_FIELDS = ("pitch", "yaw", "aim_punch_angle", "aim_punch_angle_vel")
MOVEMENT_FIELDS = (
    "velocity", "velocity_X", "velocity_Y", "velocity_Z", "move_state", "move_type",
    "ducked", "ducking", "is_airborne", "is_walking", "is_strafing", "stamina", "velo_modifier",
)
COMBAT_FIELDS = (
    "health", "armor_value", "shots_fired", "is_alive", "death_time", "life_state",
    "flash_duration", "has_helmet", "has_defuser", "is_scoped", "is_defusing",
)
ECONOMY_FIELDS = (
    "balance", "start_balance", "cash_spent_this_round", "total_cash_spent",
    "round_start_equip_value", "current_equip_value", "weapon_purchases_this_round",
    "weapon_purchases_this_match",
)
WEAPON_FIELDS = (
    "active_weapon", "active_weapon_name", "active_weapon_skin", "active_weapon_ammo",
    "active_weapon_original_owner", "total_ammo_left", "item_def_idx", "weapon_quality",
    "entity_lvl", "item_id_high", "item_id_low", "item_account_id", "inventory_position",
    "custom_name", "fallback_paint_kit", "fallback_seed", "fallback_wear", "fallback_stattrak",
    "weapon_mode", "recoil_index", "accuracy_penalty", "is_reloading", "burst_mode",
    "silencer_on", "next_primary_attack_tick", "next_secondary_attack_tick", "zoom_level",
)
GAME_STATE_FIELDS = (
    "game_time", "game_phase", "match_start_time", "game_start_time", "is_match_started",
    "is_freeze_period", "is_warmup_period", "round_start_time", "total_rounds_played",
    "rounds_played_this_phase", "round_in_progress", "round_win_status", "round_win_reason",
    "is_bomb_planted", "is_bomb_dropped", "in_bomb_zone", "which_bomb_zone", "in_buy_zone",
    "in_no_defuse_area", "ct_losing_streak", "t_losing_streak", "last_place_name",
)
TEAM_SCORE_FIELDS = (
    "team_num", "team_name", "team_rounds_total", "team_score_first_half",
    "team_score_second_half", "team_score_overtime", "score", "team_surrendered",
    "team_clan_name", "timeout_remaining",
)
AGGREGATE_FIELDS = (
    "kills_total", "deaths_total", "assists_total", "alive_time_total", "headshot_kills_total",
    "ace_rounds_total", "4k_rounds_total", "3k_rounds_total", "damage_total", "objective_total",
    "utility_damage_total", "enemies_flashed_total", "equipment_value_total", "money_saved_total",
    "kill_reward_total", "cash_earned_total",
)
BUTTON_FIELDS = (
    "buttons", "attack", "attack2", "forward", "back", "use", "left", "right", "moveleft",
    "moveright", "jump", "duck", "reload", "speed", "walk", "zoom", "scoreboard",
)
USERCMD_FIELDS = (
    "viewangle_x", "viewangle_y", "viewangle_z", "consumed_server_angle_changes",
    "forward_move", "left_move", "impulse", "mouse_dx", "mouse_dy", "left_hand_desired",
    "weapon_select", "input_history", "subtick_moves",
)
GRENADE_FIELDS = ("entity_id", "grenade_entity_id", "grenade_type", "name", "steamid", "thrower_steamid", "tick", "x", "y", "z", "X", "Y", "Z")
ROUND_FIELDS = ("number", "start_tick", "end_tick", "winner", "winner_side", "winner_team", "duration_seconds", "bomb_planted", "bomb_defused", "bomb_exploded")
PARSER_APIS = ("parse_header", "list_updated_fields", "list_game_events", "parse_event", "parse_events", "parse_grenades", "parse_item_drops", "parse_player_info", "parse_skins", "parse_ticks", "parse_voice")

EVENT_TYPES = (
    "round_start", "round_end", "round_mvp", "bomb_abortdefuse", "bomb_abortplant",
    "bomb_begindefuse", "bomb_beginplant", "bomb_defused", "bomb_dropped", "bomb_exploded",
    "bomb_pickup", "bomb_planted", "bullet_damage", "player_hurt", "bullet_impact",
    "player_death", "player_blind", "flashbang_detonate", "grenade_thrown",
    "hegrenade_detonate", "molotov_detonate", "inferno_startburn", "inferno_expire",
    "inferno_extinguish", "smokegrenade_detonate", "smokegrenade_expired", "decoy_detonate",
    "weapon_fire", "weapon_fire_on_empty", "weapon_reload", "weapon_zoom", "weapon_zoom_rifle",
    "item_equip", "item_pickup", "item_purchase", "item_remove", "enter_bombzone",
    "exit_bombzone", "enter_buyzone", "exit_buyzone",
)
EVENT_NATIVE_FIELDS = (
    "tick", "round", "total_rounds_played", "game_time", "attacker", "attacker_name",
    "attacker_steamid", "user", "user_name", "user_steamid", "victim", "victim_name",
    "victim_steamid", "assister", "assister_name", "assister_steamid", "weapon", "weapon_name",
    "headshot", "blinded", "attackerblind", "noscope", "penetrated", "distance", "dmg_health",
    "dmg_armor", "health", "armor", "hitgroup", "blind_duration", "site", "team_num",
    "user_team_num", "attacker_team_num", "x", "y", "z", "X", "Y", "Z",
)

CATEGORY_FIELDS = {
    "header": HEADER_FIELDS,
    "player_info": PLAYER_INFO_FIELDS,
    "player_properties": POSITION_FIELDS + AIM_FIELDS + MOVEMENT_FIELDS + COMBAT_FIELDS,
    "buttons": BUTTON_FIELDS,
    "game_state": GAME_STATE_FIELDS,
    "weapons": WEAPON_FIELDS,
    "inventory_econ": ECONOMY_FIELDS + ("inventory_position", "item_def_idx"),
    "usercommands": USERCMD_FIELDS,
    "aggregate_stats": AGGREGATE_FIELDS,
    "events": EVENT_TYPES,
    "event_fields": EVENT_NATIVE_FIELDS,
    "grenades": GRENADE_FIELDS,
    "bomb": tuple(field for field in GAME_STATE_FIELDS if "bomb" in field or "defuse" in field),
    "rounds": ROUND_FIELDS,
    "teams": tuple(field for field in TEAM_SCORE_FIELDS if "score" not in field),
    "score": tuple(field for field in TEAM_SCORE_FIELDS if "score" in field or "rounds" in field),
    "combat": COMBAT_FIELDS,
    "damage": ("attacker", "victim", "damage", "armor_damage", "weapon", "hitgroup", "tick", "round", "position", "distance", "blind", "headshot"),
    "death": ("attacker", "victim", "assister", "weapon", "headshot", "wallbang", "blind", "penetration", "distance", "position", "tick", "round", "team_context"),
    "movement": MOVEMENT_FIELDS,
    "aim_view": AIM_FIELDS + ("viewangle_x", "viewangle_y", "viewangle_z"),
    "economy": ECONOMY_FIELDS,
    "objective": ("bomb_planted", "bomb_defused", "bomb_exploded", "in_bomb_zone", "which_bomb_zone", "objective_total"),
    "parser_apis": PARSER_APIS,
}

CANONICAL_MAPPINGS = {
    "header.map_name": ("header.map", "CanonicalMatch.map"),
    "header.demo_version_name": ("header.game_version", "CanonicalMatch.gameVersion"),
    "header.playback_ticks_per_second": ("header.tickrate", "CanonicalMatch.tickrate"),
    "player_info.steamid": ("players[].steam_id", "CanonicalPlayer.steamId"),
    "player_info.name": ("players[].name", "CanonicalPlayer.name"),
    "player_info.team_number": ("players[].side", "CanonicalPlayer.side"),
    "rounds.winner_side": ("rounds[].winner_side", "CanonicalRound.winnerSide"),
}
DERIVATIONS = {
    "rounds.start_tick": "ordered parser-native round_start.tick",
    "rounds.end_tick": "first parser-native round_end.tick within the observed start interval",
    "rounds.number": "positive parser-native completed-round counter",
    "game_state.round_start_time": "tick - (game_time - round_start_time) * verified_tickrate",
}

@dataclass(frozen=True)
class Capability:
    capability_id: str
    category: str
    name: str
    parser_api: str
    parser_version: str
    source: str
    source_kind: str
    provenance: str
    availability: str
    classification: str
    app_field: str | None = None
    canonical_field: str | None = None
    derivation_rule: str | None = None
    reason: str | None = None


def _api(category: str) -> str:
    if category == "header": return "parse_header"
    if category == "player_info": return "parse_player_info"
    if category == "grenades": return "parse_grenades"
    if category in {"events", "event_fields", "damage", "death"}: return "list_game_events+parse_event"
    if category == "parser_apis": return "installed_runtime_introspection"
    return "list_updated_fields+parse_ticks"


def _entry(category: str, name: str) -> Capability:
    key = f"{category}.{name}"
    if key in CANONICAL_MAPPINGS:
        app, canonical = CANONICAL_MAPPINGS[key]
        return Capability(key, category, name, _api(category), PARSER_VERSION, CATALOG_SOURCE, "INSTALLED_RUNTIME_AND_REVIEW", f"demoparser2=={PARSER_VERSION}:{_api(category)}", "DECLARED", "CANONICAL", app, canonical)
    if key in DERIVATIONS:
        return Capability(key, category, name, _api(category), PARSER_VERSION, CATALOG_SOURCE, "INSTALLED_RUNTIME_AND_REVIEW", f"demoparser2=={PARSER_VERSION}:{_api(category)}", "DECLARED", "DERIVED", derivation_rule=DERIVATIONS[key])
    classification = "UNAVAILABLE" if category == "parser_apis" and name not in PARSER_APIS else "RAW_ONLY"
    reason = "Installed runtime API is unavailable." if classification == "UNAVAILABLE" else "Preserved as reviewed demoparser2 0.42.0 forensic evidence; not authorized for Canonical."
    return Capability(key, category, name, _api(category), PARSER_VERSION, CATALOG_SOURCE, "INSTALLED_RUNTIME_AND_REVIEW", f"demoparser2=={PARSER_VERSION}:{_api(category)}", "DECLARED", classification, reason=reason)


def static_capabilities() -> tuple[Capability, ...]:
    rows = tuple(_entry(category, name) for category, fields in CATEGORY_FIELDS.items() for name in fields)
    ids = [row.capability_id for row in rows]
    if len(ids) != len(set(ids)):
        raise RuntimeError("capability_catalog_duplicate")
    return tuple(sorted(rows, key=lambda row: row.capability_id))


def catalog_payload(runtime_fields: Iterable[str] = (), runtime_events: Iterable[str] = (), *, discovery_error: str | None = None) -> dict[str, Any]:
    rows = [asdict(row) for row in static_capabilities()]
    known = {row["capability_id"] for row in rows}
    for name in sorted(set(str(v) for v in runtime_fields if str(v).strip())):
        key = f"runtime_field.{name}"
        if key not in known:
            rows.append(asdict(Capability(key, "runtime_field", name, "list_updated_fields", PARSER_VERSION, CATALOG_SOURCE, "RUNTIME_DISCOVERY", "demoparser2.list_updated_fields", "AVAILABLE", "RAW_ONLY", reason="Runtime-discovered parser field; preserved and requires explicit semantic review before Canonical.")))
    for name in sorted(set(str(v) for v in runtime_events if str(v).strip())):
        key = f"events.{name}"
        if key not in known:
            rows.append(asdict(Capability(key, "event_type", name, "list_game_events+parse_event", PARSER_VERSION, CATALOG_SOURCE, "RUNTIME_DISCOVERY", "demoparser2.list_game_events", "AVAILABLE", "RAW_ONLY", reason="Runtime-discovered event; preserved and requires explicit semantic review before Canonical.")))
    rows.sort(key=lambda row: row["capability_id"])
    projection = {"parser_name": PARSER_NAME, "parser_version": PARSER_VERSION, "catalog_version": CATALOG_VERSION, "catalog_source": CATALOG_SOURCE, "capabilities": rows}
    digest = hashlib.sha256(json.dumps(projection, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    return {**projection, "catalog_digest": digest, "complete": discovery_error is None, "discovery_error": discovery_error}


def reconcile_capabilities(catalog: dict[str, Any]) -> dict[str, Any]:
    rows = [row for row in catalog.get("capabilities") or [] if isinstance(row, dict)]
    ids = [str(row.get("capability_id") or "") for row in rows]
    duplicates = sorted({capability_id for capability_id in ids if ids.count(capability_id) > 1})
    unresolved = sorted(
        capability_id for capability_id, row in zip(ids, rows)
        if row.get("classification") not in CLASSIFICATIONS
        or (row.get("classification") == "CANONICAL" and (not row.get("app_field") or not row.get("canonical_field")))
        or (row.get("classification") == "DERIVED" and not row.get("derivation_rule"))
        or (row.get("classification") == "RAW_ONLY" and not row.get("reason"))
    )
    runtime_ids = sorted(capability_id for capability_id, row in zip(ids, rows) if row.get("source_kind") == "RUNTIME_DISCOVERY")
    mapped_ids = sorted(capability_id for capability_id, row in zip(ids, rows) if row.get("classification") in CLASSIFICATIONS)
    orphan = sorted(set(runtime_ids) - set(ids))
    missing = sorted(set(ids) - set(mapped_ids))
    result = {
        "status": "PASS" if not duplicates and not unresolved and not orphan and not missing else "BLOCKED",
        "catalog_count": len(ids),
        "runtime_count": len(runtime_ids),
        "mapping_count": len(mapped_ids),
        "unresolved_count": len(unresolved),
        "duplicate_count": len(duplicates),
        "orphan_count": len(orphan),
        "set_difference_count": len(missing),
        "missing_from_inventory": missing,
        "runtime_orphans": orphan,
        "duplicates": duplicates,
        "unresolved": unresolved,
    }
    result["digest"] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    return result


def validate_catalog(catalog: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    if catalog.get("parser_name") != PARSER_NAME or catalog.get("parser_version") != PARSER_VERSION: reasons.append("capability_catalog_parser_mismatch")
    if catalog.get("catalog_version") != CATALOG_VERSION: reasons.append("capability_catalog_version_unsupported")
    rows = catalog.get("capabilities")
    if not isinstance(rows, list) or not rows: return reasons + ["capability_catalog_empty"]
    ids = [row.get("capability_id") for row in rows if isinstance(row, dict)]
    if len(ids) != len(rows) or len(ids) != len(set(ids)): reasons.append("capability_catalog_duplicate")
    for row in rows:
        if not isinstance(row, dict) or row.get("classification") not in CLASSIFICATIONS: reasons.append("capability_catalog_classification_invalid"); continue
        if row["classification"] == "CANONICAL" and (not row.get("app_field") or not row.get("canonical_field")): reasons.append(f"canonical_mapping_missing:{row.get('capability_id')}")
        if row["classification"] == "DERIVED" and not row.get("derivation_rule"): reasons.append(f"derivation_rule_missing:{row.get('capability_id')}")
        if row["classification"] == "RAW_ONLY" and not row.get("reason"): reasons.append(f"raw_only_reason_missing:{row.get('capability_id')}")
        for required in ("capability_id", "category", "name", "parser_version", "source", "source_kind", "provenance", "availability"):
            if not str(row.get(required) or "").strip(): reasons.append(f"capability_metadata_missing:{row.get('capability_id')}:{required}")
    projection = {key: catalog.get(key) for key in ("parser_name", "parser_version", "catalog_version", "catalog_source", "capabilities")}
    actual = hashlib.sha256(json.dumps(projection, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    if catalog.get("catalog_digest") != actual: reasons.append("capability_catalog_digest_mismatch")
    if catalog.get("complete") is not True: reasons.append("capability_catalog_incomplete")
    return sorted(set(reasons))
