"""Raw demo evidence and coverage, kept separate from the APP/canonical contract."""
from __future__ import annotations

import hashlib
import json
import math
import struct
from typing import Any, Iterable, Sequence

from capability_catalog import CLASSIFICATIONS, reconcile_capabilities, validate_catalog
from forensic_audit import AUDIT_CONTRACT_VERSION, deterministic_digest

EVIDENCE_VERSION = 1
TICK_SAMPLE_LIMIT = 4096
AUDIT_SURFACE_VERSION = 2
DIGEST_KEYS: tuple[str, ...] = (
    "evidence_version", "manifest", "event_coverage", "raw_events", "raw_player_info",
    "player_coverage", "tick_coverage", "tick_samples", "grenade_coverage",
    "grenade_samples", "round_evidence", "economy_coverage", "field_mappings", "gates",
)

EVENT_CANDIDATES: tuple[str, ...] = (
    "bomb_abortdefuse", "bomb_abortplant", "bomb_begindefuse", "bomb_beginplant",
    "bomb_defused", "bomb_dropped", "bomb_exploded", "bomb_pickup", "bomb_planted",
    "bullet_damage", "bullet_impact", "decoy_detonate", "enter_bombzone", "enter_buyzone",
    "exit_bombzone", "exit_buyzone", "flashbang_detonate", "grenade_thrown",
    "hegrenade_detonate", "inferno_expire", "inferno_extinguish", "inferno_startburn",
    "item_equip", "item_pickup", "item_purchase", "item_remove", "molotov_detonate",
    "player_blind", "player_death", "player_hurt", "round_end", "round_mvp", "round_start",
    "smokegrenade_detonate", "smokegrenade_expired", "weapon_fire",
    "weapon_fire_on_empty", "weapon_reload", "weapon_zoom", "weapon_zoom_rifle",
)

PLAYER_PROPERTIES: tuple[str, ...] = (
    "X", "Y", "Z", "active_weapon", "active_weapon_name", "active_weapon_ammo",
    "aim_punch_angle", "aim_punch_angle_vel", "armor_value", "balance",
    "cash_spent_this_round", "current_equip_value", "death_time", "ducked", "ducking",
    "flash_duration", "game_time", "has_defuser", "has_helmet", "health", "in_bomb_zone",
    "in_buy_zone", "in_no_defuse_area", "is_airborne", "is_alive", "is_defusing",
    "is_scoped", "is_strafing", "is_walking", "last_place_name", "life_state",
    "move_state", "pitch", "player_name",
    "player_steamid", "round_start_equip_value", "score", "shots_fired", "spawn_time",
    "start_balance", "team_num", "total_cash_spent", "velocity", "velocity_X", "velocity_Y",
    "velocity_Z", "velo_modifier", "weapon_purchases_this_match",
    "weapon_purchases_this_round", "which_bomb_zone", "yaw",
    "kills_total", "deaths_total", "assists_total", "alive_time_total",
    "headshot_kills_total", "ace_rounds_total", "4k_rounds_total", "3k_rounds_total",
    "damage_total", "objective_total", "utility_damage_total", "enemies_flashed_total",
    "equipment_value_total", "money_saved_total", "kill_reward_total", "cash_earned_total",
    "team_rounds_total", "team_name", "team_score_first_half", "team_score_second_half",
    "team_score_overtime", "is_freeze_period", "is_warmup_period", "match_start_time",
    "round_start_time", "game_start_time", "game_phase", "total_rounds_played",
    "rounds_played_this_phase", "is_match_started", "is_bomb_dropped",
    "is_bomb_planted", "round_win_status", "round_win_reason", "ct_losing_streak",
    "t_losing_streak", "round_in_progress", "total_ammo_left", "stamina",
)

RAW_ONLY_REASON = "Retained for future behavioral/aim analysis."
REVIEWED_EVENT_FIELDS = {
    "tick", "round", "total_rounds_played", "attacker_steamid", "user_steamid",
    "assister_steamid", "attacker_name", "user_name", "assister_name", "weapon",
    "weapon_name", "headshot", "dmg_health", "dmg_armor", "health", "armor",
    "hitgroup", "blind_duration", "x", "y", "z", "X", "Y", "Z", "site",
    "team_num", "user_team_num", "attacker_team_num", "penetrated", "noscope",
    "thrusmoke", "distance", "silenced", "is_warmup_period", "is_freeze_period",
}

# Exact parser-native fields observed and reviewed for RAW preservation. These
# are not promoted to Canonical merely because they exist. Any new event or
# field still falls through to UNMAPPED_BUT_AVAILABLE and blocks admission.
REVIEWED_RAW_ONLY_EVENT_FIELDS: dict[str, frozenset[str]] = {
    "announce_phase_end": frozenset({"__event__", "tick"}),
    "bomb_defused": frozenset({"c4"}),
    "bomb_dropped": frozenset({"entindex"}),
    "bomb_exploded": frozenset({"c4"}),
    "bomb_planted": frozenset({"c4"}),
    "chat_message": frozenset({"__event__", "chat_message", "tick", "user_name", "user_steamid"}),
    "cs_intermission": frozenset({"__event__", "tick"}),
    "cs_pre_restart": frozenset({"__event__", "tick"}),
    "cs_round_final_beep": frozenset({"__event__", "tick"}),
    "cs_round_start_beep": frozenset({"__event__", "tick"}),
    "cs_win_panel_match": frozenset({"__event__", "tick"}),
    "decoy_detonate": frozenset({"entityid"}),
    "decoy_started": frozenset({"__event__", "entityid", "tick", "user_name", "user_steamid", "x", "y", "z"}),
    "entity_killed": frozenset({"__event__", "damagebits", "entindex_attacker", "entindex_inflictor", "entindex_killed", "tick"}),
    "fire_bullets": frozenset({
        "__event__", "angles_x", "angles_y", "angles_z", "attack_type", "ent_origin_x",
        "ent_origin_y", "ent_origin_z", "inaccuracy", "item_def_index", "mode",
        "num_bullets_remaining", "origin_x", "origin_y", "origin_z", "player",
        "player_inair", "player_scoped", "recoil_index", "round", "seed",
        "sound_dsp_effect", "sound_type", "spread", "tick", "user_name",
        "user_steamid", "weapon_id",
    }),
    "flashbang_detonate": frozenset({"entityid"}),
    "hegrenade_detonate": frozenset({"entityid"}),
    "hltv_chase": frozenset({"__event__", "distance", "inertia", "ineye", "phi", "target1", "target2", "theta", "tick"}),
    "hltv_versioninfo": frozenset({"__event__", "tick", "version"}),
    "inferno_expire": frozenset({"entityid"}),
    "inferno_startburn": frozenset({"entityid"}),
    "item_pickup": frozenset({"defindex", "item", "silent"}),
    "player_activate": frozenset({"__event__", "tick", "user_name", "user_steamid"}),
    "player_connect": frozenset({"__event__"}),
    "player_connect_full": frozenset({"__event__", "tick", "user_name", "user_steamid"}),
    "player_death": frozenset({
        "assistedflash", "attackerblind", "attackerinair", "dominated", "noreplay",
        "revenge", "weapon_fauxitemid", "weapon_itemid", "weapon_originalowner_xuid", "wipe",
    }),
    "player_ping": frozenset({"__event__", "entityid", "tick", "urgent", "user_name", "user_steamid", "x", "y", "z"}),
    "player_ping_stop": frozenset({"__event__", "entityid", "tick", "user_name", "user_steamid"}),
    "player_sound": frozenset({"__event__", "duration", "radius", "step", "tick", "user_name", "user_steamid"}),
    "player_spawn": frozenset({"__event__", "tick", "user_name", "user_steamid"}),
    "player_team": frozenset({"__event__", "disconnect", "isbot", "oldteam", "silent", "team", "tick", "user_name", "user_steamid"}),
    "round_announce_final": frozenset({"__event__", "tick"}),
    "round_announce_last_round_half": frozenset({"__event__", "tick"}),
    "round_announce_match_point": frozenset({"__event__", "tick"}),
    "round_announce_match_start": frozenset({"__event__", "tick"}),
    "round_freeze_end": frozenset({"__event__", "tick"}),
    "round_time_warning": frozenset({"__event__", "tick"}),
    "server_cvar": frozenset({"__event__", "name", "tick", "value"}),
    "server_message": frozenset({"__event__", "server_message", "tick"}),
    "smokegrenade_detonate": frozenset({"entityid"}),
    "smokegrenade_expired": frozenset({"entityid"}),
}

REVIEWED_GRENADE_FIELDS = frozenset({
    "grenade_entity_id", "grenade_type", "name", "steamid", "tick", "x", "y", "z",
})

REVIEWED_HEADER_FIELDS = frozenset({
    "addons", "allow_clientside_entities", "allow_clientside_particles", "client_name",
    "demo_file_stamp", "demo_version_guid", "fullpackets_version", "game_directory",
    "patch_version", "server_name",
})

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
    "game_state.total_rounds_played": ("rounds[].number", "CanonicalRound.roundNumber", "DERIVED"),
    "game_state.round_start_time": ("rounds[].start_tick", "CanonicalRound.startTick", "DERIVED"),
    "game_state.tick": ("hot.*[].tick", "match_sources.metadata.semantic_player_data", "MAPPED"),
    "game_state.steamid": ("hot.*[].player", "match_sources.metadata.semantic_player_data", "MAPPED"),
    "game_state.name": ("hot.*[].player_name", "match_sources.metadata.semantic_player_data", "MAPPED"),
    "player_death.attacker_steamid": ("events[].attacker", "CanonicalEvent.actorSteamId", "MAPPED"),
    "player_death.user_steamid": ("events[].victim", "CanonicalEvent.victimSteamId", "MAPPED"),
    "player_death.assister_steamid": ("events[].assister", "CanonicalEvent.assisterSteamId", "MAPPED"),
    "player_death.weapon": ("events[].weapon", "CanonicalEvent.weapon", "MAPPED"),
    "player_death.headshot": ("events[].headshot", "CanonicalEvent.headshot", "MAPPED"),
    "player_death.attackerblind": ("events[].blind", "CanonicalEvent.data.blind", "MAPPED"),
    "player_death.noscope": ("events[].noscope", "CanonicalEvent.data.noscope", "MAPPED"),
    "player_death.penetrated": ("events[].penetration", "CanonicalEvent.data.penetration", "MAPPED"),
    "player_death.distance": ("events[].distance", "CanonicalEvent.distance", "MAPPED"),
    "player_hurt.attacker_steamid": ("events[].attacker", "CanonicalEvent.actorSteamId", "MAPPED"),
    "player_hurt.user_steamid": ("events[].victim", "CanonicalEvent.victimSteamId", "MAPPED"),
    "player_hurt.weapon": ("events[].weapon", "CanonicalEvent.weapon", "MAPPED"),
    "player_hurt.dmg_health": ("events[].damage", "CanonicalEvent.damage", "MAPPED"),
    "player_hurt.dmg_armor": ("events[].armor_damage", "CanonicalEvent.data.armor_damage", "MAPPED"),
    "player_blind.blind_duration": ("events[].flash_duration", "CanonicalEvent.data.flash_duration", "MAPPED"),
}


def _safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return int(value) if value.is_integer() else value
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
    projection = {key: value[key] for key in DIGEST_KEYS}
    return hashlib.sha256(canonical_digest_value(projection).encode("utf-8")).hexdigest()


def canonical_digest_value(value: Any) -> str:
    value = _safe(value)
    if value is None:
        return "N;"
    if isinstance(value, bool):
        return "B1;" if value else "B0;"
    if isinstance(value, (int, float)):
        number = float(value)
        if not math.isfinite(number):
            return "N;"
        if number == 0:
            number = 0.0
        return f"D{struct.pack('>d', number).hex()};"
    if isinstance(value, str):
        return f"S{len(value.encode('utf-8'))}:{value}"
    if isinstance(value, list):
        return f"A{len(value)}[" + "".join(canonical_digest_value(item) for item in value) + "]"
    if isinstance(value, dict):
        entries = sorted(((str(key), item) for key, item in value.items()), key=lambda item: item[0])
        return f"O{len(entries)}{{" + "".join(
            canonical_digest_value(key) + canonical_digest_value(item) for key, item in entries
        ) + "}"
    raise TypeError("unsupported RAW evidence value")


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
                   error: BaseException | None = None, *, api_available: bool = True) -> dict[str, Any]:
    safe_rows = list(rows or [])
    first_tick, last_tick = _range(safe_rows, "tick")
    rounds = [r for row in safe_rows for r in [_int(row.get("round") or row.get("total_rounds_played"))] if r is not None]
    all_fields = {str(key) for row in safe_rows for key in row}
    non_null_fields = sorted({str(key) for row in safe_rows for key, value in row.items() if value is not None})
    null_only_fields = sorted(all_fields - set(non_null_fields))
    missing_fields = sorted(field for field in all_fields if any(field not in row for row in safe_rows))
    error_type, error_message = safe_error(error) if error else (None, None)
    state = (
        "API_UNAVAILABLE" if not api_available else
        "PARSE_FAILED" if error is not None else
        "NOT_PRESENT_IN_DEMO" if not available else
        "AVAILABLE_BUT_EMPTY" if not safe_rows else
        "PARSED_SUCCESSFULLY"
    )
    classification = "UNAVAILABLE" if not api_available else "PARSE_FAILED" if error is not None else "NOT_PRESENT" if not available else "RAW_ONLY"
    result = {
        "event_name": name, "discovered": available, "available": available, "attempted": available or error is not None, "parse_attempted": available or error is not None,
        "parse_status": state, "classification": classification, "null_only": bool(safe_rows) and not non_null_fields,
        "parse_success": available and error is None, "row_count": len(safe_rows) if error is None and available else None,
        "first_tick": first_tick, "last_tick": last_tick,
        "first_round": min(rounds) if rounds else None, "last_round": max(rounds) if rounds else None,
        "fields_available": sorted(all_fields), "fields_missing": missing_fields,
        "returned_fields": sorted(all_fields), "non_null_fields": non_null_fields,
        "null_only_fields": null_only_fields, "preserved_fields": sorted(all_fields),
        "error_type": error_type,
        "error_message_safe": error_message, "capability_state": state,
        "native_types": {field: sorted({_type_name(row.get(field)) for row in safe_rows if field in row}) for field in sorted(all_fields)},
        "player_refs": sorted({str(value) for row in safe_rows for key, value in row.items() if ("steamid" in key or key in {"attacker", "user", "assister"}) and value is not None}),
        "round_refs": sorted(set(rounds)),
        "extra_fields": [],
        "failure_reason": error_message,
        "failure_kind": classification if classification in {"UNAVAILABLE", "PARSE_FAILED", "NOT_PRESENT"} else None,
        "failure_stage": "parse_event", "api_available": api_available,
    }
    result["deterministic_digest"] = deterministic_digest(result)
    return result


def _type_name(value: Any) -> str:
    if value is None: return "null"
    if isinstance(value, bool): return "boolean"
    if isinstance(value, int): return "integer"
    if isinstance(value, float): return "number"
    if isinstance(value, str): return "string"
    if isinstance(value, list): return "array"
    if isinstance(value, dict): return "object"
    return type(value).__name__


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
        if rows is not None and name not in EVENT_CANDIDATES:
            observed.add(f"{name}.__event__")
        for row in rows or []:
            for key in row: observed.add(f"{name}.{key}")
    for row in raw.get("tick_rows") or []:
        for key in row: observed.add(f"game_state.{key}")
    for row in raw.get("grenade_rows") or []:
        for key in row: observed.add(f"grenade.{key}")
    for row in raw.get("round_rows") or []:
        for key in row: observed.add(f"round.{key}")
    result = []
    for field in sorted(observed):
        if field in MAPPED_RAW_FIELDS:
            app_field, canonical_field, status = MAPPED_RAW_FIELDS[field]
            reason = None
        elif field.startswith("player.") and field.removeprefix("player.") in PLAYER_PROPERTIES:
            app_field, canonical_field, status, reason = None, None, "RAW_ONLY_INTENTIONAL", RAW_ONLY_REASON
        elif any(
            field.startswith(f"{event}.") and field.removeprefix(f"{event}.") in REVIEWED_EVENT_FIELDS
            for event in EVENT_CANDIDATES
        ):
            app_field, canonical_field, status, reason = None, None, "RAW_ONLY_INTENTIONAL", RAW_ONLY_REASON
        elif field.startswith("game_state.") and field.removeprefix("game_state.") in PLAYER_PROPERTIES:
            app_field, canonical_field, status, reason = None, None, "RAW_ONLY_INTENTIONAL", RAW_ONLY_REASON
        elif field.startswith("header.") and field.removeprefix("header.") in REVIEWED_HEADER_FIELDS:
            app_field, canonical_field, status, reason = None, None, "RAW_ONLY_INTENTIONAL", "Preserved as parser/demo provenance metadata."
        elif field.startswith("grenade.") and field.removeprefix("grenade.") in REVIEWED_GRENADE_FIELDS:
            app_field, canonical_field, status, reason = None, None, "RAW_ONLY_INTENTIONAL", "Preserved as full-resolution grenade trajectory evidence."
        elif any(
            field.startswith(f"{event}.") and field.removeprefix(f"{event}.") in reviewed
            for event, reviewed in REVIEWED_RAW_ONLY_EVENT_FIELDS.items()
        ):
            app_field, canonical_field, status, reason = None, None, "RAW_ONLY_INTENTIONAL", "Preserved as reviewed parser-native event evidence."
        else:
            app_field, canonical_field, status, reason = None, None, "UNMAPPED_BUT_AVAILABLE", None
        result.append({"raw_field": field, "app_field": app_field, "canonical_field": canonical_field, "status": status, "reason": reason})
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
        "partial_parse": False,
        "extraction_confidence": None,
        "event_inventory": list(raw.get("event_inventory") or []),
        "event_capability_coverage": "COMPLETE" if raw.get("event_inventory_error") is None else "LIMITED",
        "raw_header": _safe(header),
        "selected_event_candidates": list(EVENT_CANDIDATES),
        "parsed_event_tables": sorted(name for name, rows in (raw.get("event_tables") or {}).items() if rows is not None),
        "tick_sample_rows": len(raw.get("tick_rows") or []),
        "event_rows": sum(len(rows or []) for rows in (raw.get("event_tables") or {}).values()),
        "estimated_evidence_bytes": None,
        "tick_sampling": {
            "coverage": "SAMPLE",
            "limit": TICK_SAMPLE_LIMIT,
            "strategy": "event-boundary-stratified",
            "truncated": len(raw.get("tick_rows") or []) >= TICK_SAMPLE_LIMIT,
            "sample_size": len(raw.get("tick_rows") or []),
            "first_sampled_tick": min((_int(row.get("tick")) for row in raw.get("tick_rows") or []) , default=None),
            "last_sampled_tick": max((_int(row.get("tick")) for row in raw.get("tick_rows") or []) , default=None),
            "total_demo_ticks": _int(header.get("playback_ticks")),
            "full_extraction": False,
        },
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
    mapping_failures = {"UNMAPPED_BUT_AVAILABLE", "PARSE_FAILED"}
    mapping_ok = bool(mappings) and not any(item["status"] in mapping_failures for item in mappings)
    intentional_ok = all(item.get("reason") for item in mappings if item["status"] == "RAW_ONLY_INTENTIONAL")
    mapping_ok = mapping_ok and intentional_ok
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


def build_forensic_contract_v2(evidence: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    """Create additive exhaustive evidence without changing historical v1 semantics."""
    catalog = raw.get("capability_catalog") or {}
    tick_audit = raw.get("full_tick_audit") or {}
    property_inventory = list(raw.get("full_tick_properties") or [])
    event_inventory = list(evidence.get("event_coverage") or [])
    legacy_to_v2 = {"MAPPED": "CANONICAL", "RAW_ONLY_INTENTIONAL": "RAW_ONLY", "NOT_PRESENT_IN_DEMO": "NOT_PRESENT"}
    mappings = [
        {**row, "status": legacy_to_v2.get(str(row.get("status")), row.get("status"))}
        for row in (evidence.get("field_mappings") or []) if isinstance(row, dict)
    ]
    inventory = evidence.get("forensic_inventory") or forensic_inventory(evidence)
    catalog_reasons = validate_catalog(catalog) if isinstance(catalog, dict) else ["capability_catalog_missing"]
    parse_failures = sorted(
        [f"event:{row.get('event_name')}" for row in event_inventory if row.get("capability_state") in {"PARSE_FAILED", "API_UNAVAILABLE"}]
        + [f"property:{row.get('property')}" for row in property_inventory if row.get("classification") == "PARSE_FAILED"]
    )
    mapping_failures = sorted(
        str(row.get("raw_field")) for row in mappings
        if row.get("status") not in CLASSIFICATIONS
        or row.get("status") in {"PARSE_FAILED"}
        or (row.get("status") == "RAW_ONLY" and not str(row.get("reason") or "").strip())
    )
    capability_reconciliation = reconcile_capabilities(catalog) if isinstance(catalog, dict) else {"status": "BLOCKED"}
    required_families = {
        "header_inventory", "player_info_inventory", "game_state_inventory", "round_inventory",
        "bomb_inventory", "damage_inventory", "death_inventory", "weapon_inventory",
        "grenade_inventory", "usercmd_inventory", "teams_inventory", "score_inventory",
        "aggregate_inventory", "movement_inventory", "all_event_inventory",
    }
    missing_families = sorted(required_families - set(inventory))
    identity_ok = (
        evidence.get("manifest", {}).get("parser_name") == "demoparser2"
        and evidence.get("manifest", {}).get("parser_version") == "0.42.0"
        and evidence.get("manifest", {}).get("contract_version") == 1
    )
    semantic = _semantic_gate_results(evidence, inventory)
    discovered_not_attempted = sorted(str(row.get("event_name")) for row in event_inventory if row.get("discovered") is True and row.get("attempted") is not True)
    checks = {
        "01-parser-identity": (identity_ok, ["parser_identity_mismatch"]),
        "02-capability-catalog": (not catalog_reasons and capability_reconciliation.get("status") == "PASS", catalog_reasons + ([] if capability_reconciliation.get("status") == "PASS" else ["capability_reconciliation_failed"])),
        "03-event-discovery": (evidence.get("manifest", {}).get("event_inventory_success") is True, ["event_inventory_incomplete"]),
        "04-all-events-attempted": (not discovered_not_attempted and all(row.get("capability_state") not in {"PARSE_FAILED", "API_UNAVAILABLE"} for row in event_inventory), discovered_not_attempted + parse_failures),
        "05-full-tick-domain": (tick_audit.get("domain_proof_status") == "PASS" and tick_audit.get("coverage") == "FULL_TICK_DOMAIN_AUDIT" and tick_audit.get("complete") is True, list(tick_audit.get("failures") or ["full_tick_domain_unproven"])),
        "06-tick-batches": (bool(tick_audit.get("batches")) and all(row.get("status") == "PASS" for row in tick_audit.get("batches") or []), ["tick_batch_failed"]),
        "07-tick-gaps": (not tick_audit.get("missing_tick_count"), ["tick_gap_detected"]),
        "08-tick-overlaps": (not tick_audit.get("overlap_count") and not tick_audit.get("unexpected_tick_count") and not tick_audit.get("duplicate_tick_count"), ["tick_overlap_or_unexpected_detected"]),
        "09-properties-classified": (bool(property_inventory) and all(row.get("classification") in CLASSIFICATIONS for row in property_inventory), ["property_classification_incomplete"]),
        "10-header": semantic["header"],
        "11-player-info": semantic["players"],
        "12-rounds": semantic["rounds"],
        "13-bomb": semantic["bomb"],
        "14-combat": semantic["combat"],
        "15-grenades": semantic["grenades"],
        "16-teams-score": semantic["teams_score"],
        "17-usercmd": semantic["usercmd"],
        "18-weapons-inventory": semantic["weapons_economy"],
        "19-aggregates": semantic["aggregates"],
        "20-mapping-complete": (bool(mappings) and not mapping_failures, mapping_failures or ["mapping_inventory_empty"]),
        "21-no-parse-failures": (not parse_failures, parse_failures),
        "22-physical-reaudit": (False, ["physical_chunk_reaudit_pending_app"]),
    }
    gates = [
        {"gate": f"RAW-V2-{name}", "status": "PASS" if passed else "BLOCKED", "reasons": [] if passed else sorted(set(reasons))}
        for name, (passed, reasons) in checks.items()
    ]
    contract = {
        "audit_contract_version": AUDIT_CONTRACT_VERSION,
        "parser": {"name": evidence.get("manifest", {}).get("parser_name"), "version": evidence.get("manifest", {}).get("parser_version")},
        "capability_catalog": catalog,
        "capability_reconciliation": capability_reconciliation,
        "full_tick_audit": tick_audit,
        "property_inventory": property_inventory,
        "event_inventory": event_inventory,
        "semantic_inventories": inventory,
        "semantic_gate_evidence": {name: {"status": "PASS" if passed else "BLOCKED", "reasons": reasons}
                                   for name, (passed, reasons) in semantic.items()},
        "mapping_inventory": mappings,
        "gates": gates,
        "producer_gate_status": "PASS" if all(gate["status"] == "PASS" for gate in gates[:-1]) else "BLOCKED",
        "physical_gate_status": "PENDING",
        "final_gate_status": "BLOCKED",
        "physical_reaudit_required": True,
        "canonical_admission": "BLOCKED",
    }
    contract["catalog_digest"] = catalog.get("catalog_digest") if isinstance(catalog, dict) else None
    contract["tick_authority_digest"] = (tick_audit.get("tick_domain_source") or {}).get("digest")
    contract["unsigned_contract_digest"] = deterministic_digest(contract)
    contract["deterministic_digest"] = contract["unsigned_contract_digest"]
    return contract


def _semantic_gate_results(evidence: dict[str, Any], inventory: dict[str, Any]) -> dict[str, tuple[bool, list[str]]]:
    """Validate evidence relationships; key presence alone never constitutes proof."""
    manifest = evidence.get("manifest") or {}; players = evidence.get("raw_player_info") or []
    rounds = evidence.get("round_evidence") or []; events = evidence.get("raw_events") or []
    player_ids = [str(row.get("steamid", row.get("player_steamid"))) for row in players if row.get("steamid", row.get("player_steamid")) is not None]
    header_ok = isinstance(manifest.get("raw_header"), dict) and bool(manifest.get("map")) and bool(manifest.get("demo_version_name")) and bool(manifest.get("parser_name"))
    player_ok = bool(players) and len(player_ids) == len(players) and len(player_ids) == len(set(player_ids)) and all(isinstance(row.get("name"), str) and row.get("name") for row in players)
    rounds_ok = _round_invariants_pass(rounds, events)
    round_by_number = {_int(row.get("number")): row for row in rounds}
    known_players = set(player_ids)
    def event_refs_valid(names: set[str], required: tuple[str, ...]) -> bool:
        selected = [row for row in events if row.get("event_name") in names]
        for event in selected:
            raw = event.get("raw_fields") or {}; number = _int(event.get("round")); tick = _int(event.get("tick"))
            if not isinstance(raw, dict) or any(raw.get(field) is None for field in required): return False
            if number not in round_by_number or tick is None: return False
            for key, value in raw.items():
                if "steamid" in key and value is not None and known_players and str(value) not in known_players: return False
        return bool(selected)
    bomb_names = {"bomb_planted", "bomb_defused", "bomb_exploded"}
    bomb_rows = sorted((row for row in events if row.get("event_name") in bomb_names), key=lambda row: _int(row.get("tick")) or -1)
    bomb_ok = bool(bomb_rows) and all(_int(row.get("tick")) is not None and _int(row.get("round")) in round_by_number for row in bomb_rows)
    for index, row in enumerate(bomb_rows):
        if row.get("event_name") in {"bomb_defused", "bomb_exploded"} and not any(prior.get("event_name") == "bomb_planted" and prior.get("round") == row.get("round") for prior in bomb_rows[:index]): bomb_ok = False
    combat_ok = event_refs_valid({"player_hurt"}, ("attacker_steamid", "user_steamid", "dmg_health")) and event_refs_valid({"player_death"}, ("attacker_steamid", "user_steamid", "weapon"))
    grenades = evidence.get("grenade_samples") or []
    grenade_ok = bool(grenades) and all(_int(row.get("tick")) is not None and row.get("grenade_type") is not None and str(row.get("steamid", row.get("thrower_steamid"))) in known_players for row in grenades)
    team_fields = set(inventory.get("teams_inventory") or []); score_fields = set(inventory.get("score_inventory") or [])
    teams_ok = bool(team_fields) and bool(score_fields) and all(row.get("score") is not None for row in players if "score" in row)
    usercmd = inventory.get("usercmd_capability") or {}; usercmd_ok = isinstance(usercmd, dict) and usercmd.get("coverage") == "AVAILABLE" and bool(inventory.get("usercmd_inventory"))
    weapons_ok = bool(inventory.get("weapon_inventory")) and any(row.get("available") is True for row in evidence.get("economy_coverage") or [])
    aggregate_fields = inventory.get("aggregate_inventory") or []
    aggregates_ok = bool(aggregate_fields) and all(any(token in field for token in ("player.", "game_state.")) for field in aggregate_fields)
    return {
        "header": (header_ok, [] if header_ok else ["header_semantics_unproven"]),
        "players": (player_ok, [] if player_ok else ["player_identity_or_uniqueness_unproven"]),
        "rounds": (rounds_ok, [] if rounds_ok else ["round_lifecycle_or_containment_invalid"]),
        "bomb": (bomb_ok, [] if bomb_ok else ["bomb_lifecycle_unproven"]),
        "combat": (combat_ok, [] if combat_ok else ["combat_relationships_unproven"]),
        "grenades": (grenade_ok, [] if grenade_ok else ["grenade_identity_or_lifecycle_unproven"]),
        "teams_score": (teams_ok, [] if teams_ok else ["team_score_provenance_unproven"]),
        "usercmd": (usercmd_ok, [] if usercmd_ok else ["usercmd_unavailable_or_unproven"]),
        "weapons_economy": (weapons_ok, [] if weapons_ok else ["weapon_economy_semantics_unproven"]),
        "aggregates": (aggregates_ok, [] if aggregates_ok else ["aggregate_scope_unproven"]),
    }


def _round_invariants_pass(rounds: Sequence[dict[str, Any]], events: Sequence[dict[str, Any]]) -> bool:
    if not rounds:
        return False
    ordered = sorted(rounds, key=lambda row: _int(row.get("number")) or -1)
    if [_int(row.get("number")) for row in ordered] != list(range(1, len(ordered) + 1)):
        return False
    for index, row in enumerate(ordered):
        start = _int(row.get("start_tick")); end = _int(row.get("end_tick"))
        if start is not None and end is not None and end < start:
            return False
        next_start = _int(ordered[index + 1].get("start_tick")) if index + 1 < len(ordered) else None
        if end is not None and next_start is not None and next_start <= end:
            return False
    by_number = {_int(row.get("number")): row for row in ordered}
    for event in events:
        number = _int(event.get("round")); tick = _int(event.get("tick")); row = by_number.get(number)
        if row is None:
            return False
        start = _int(row.get("start_tick")); end = _int(row.get("end_tick"))
        if tick is not None and ((start is not None and tick < start) or (end is not None and tick > end)):
            return False
    return True


def forensic_inventory(evidence: dict[str, Any]) -> dict[str, Any]:
    """Separate discovery, extraction selection and parsed material explicitly."""
    manifest = evidence["manifest"]
    mappings = evidence["field_mappings"]
    return {
        "header_inventory": sorted((manifest.get("raw_header") or {}).keys()),
        "header_returned_fields": sorted((manifest.get("raw_header") or {}).keys()),
        "header_preserved_fields": sorted((manifest.get("raw_header") or {}).keys()),
        "player_info_inventory": sorted(item["property"] for item in evidence["player_coverage"]),
        "player_info_returned_fields": sorted({key for row in evidence["raw_player_info"] for key in row}),
        "player_info_preserved_fields": sorted({key for row in evidence["raw_player_info"] for key in row}),
        "game_state_inventory": sorted(item["property"] for item in evidence["tick_coverage"] if item["property"] != "__capability__"),
        "game_state_capability": list(PLAYER_PROPERTIES),
        "game_state_requested": list(PLAYER_PROPERTIES),
        "game_state_returned": sorted({key for row in evidence["tick_samples"] for key in row}),
        "game_state_preserved": sorted({key for row in evidence["tick_samples"] for key in row}),
        "game_state_observed_in_sample": sorted({key for row in evidence["tick_samples"] for key in row}),
        "game_state_mapping_inventory": [item for item in mappings if item["raw_field"].startswith("game_state.")],
        "round_inventory": sorted({key for row in evidence["round_evidence"] for key in row}),
        "bomb_inventory": sorted(item["event_name"] for item in evidence["event_coverage"] if item["event_name"].startswith("bomb_")),
        "damage_inventory": sorted(item["event_name"] for item in evidence["event_coverage"] if "damage" in item["event_name"] or item["event_name"] == "player_hurt"),
        "death_inventory": [item["event_name"] for item in evidence["event_coverage"] if item["event_name"] == "player_death"],
        "weapon_inventory": sorted(item["event_name"] for item in evidence["event_coverage"] if "weapon" in item["event_name"] or item["event_name"].startswith("item_")),
        "grenade_inventory": sorted(item["property"] for item in evidence["grenade_coverage"]),
        "usercmd_inventory": sorted(item["property"] for item in evidence["tick_coverage"] if item["property"] in {"buttons", "view_angles", "aim_punch_angle", "aim_punch_angle_vel", "shots_fired"}),
        "teams_inventory": sorted(item["property"] for item in evidence["player_coverage"] if "team" in item["property"] or item["property"] == "team_num"),
        "score_inventory": sorted(item["property"] for item in evidence["player_coverage"] if item["property"] == "score" or "score" in item["property"] or "rounds_total" in item["property"]),
        "aggregate_inventory": sorted(item["raw_field"] for item in mappings if "_total" in item["raw_field"]),
        "movement_inventory": sorted(item["property"] for item in evidence["tick_coverage"] if item["property"] in {"X", "Y", "Z", "velocity", "velocity_X", "velocity_Y", "velocity_Z", "yaw", "pitch"}),
        "all_event_inventory": list(manifest["event_inventory"]),
        "selected_event_extraction": list(manifest["selected_event_candidates"]),
        "actually_parsed_events": list(manifest["parsed_event_tables"]),
        "event_capability_coverage": manifest.get("event_capability_coverage", "LIMITED"),
        "event_returned_field_inventory": {
            item["event_name"]: list(item["returned_fields"])
            for item in evidence["event_coverage"]
        },
        "event_non_null_field_inventory": {
            item["event_name"]: list(item["non_null_fields"])
            for item in evidence["event_coverage"]
        },
        "event_null_only_field_inventory": {
            item["event_name"]: list(item["null_only_fields"])
            for item in evidence["event_coverage"]
        },
        "event_preserved_field_inventory": {
            name: sorted({key for event in evidence["raw_events"] if event["event_name"] == name for key in event["raw_fields"]})
            for name in manifest["parsed_event_tables"]
        },
        "usercmd_capability": {
            "coverage": "UNAVAILABLE",
            "source": "demoparser2_parse_ticks",
            "reason": "client usercmd stream is not universally enumerable in server demos",
        },
        "movement_coverage": {"coverage": "SAMPLE", "source": "tick_samples", "derived": False},
        "mapping_inventory": mappings,
        "tick_sampling": manifest["tick_sampling"],
    }


def raw_audit_status(evidence: dict[str, Any]) -> tuple[str, list[str]]:
    """Unknown fields are evidence: preserve them, but never silently admit Canonical."""
    reasons: list[str] = []
    failed = False
    if not evidence.get("gates"):
        reasons.append("audit_gates_empty")
    if not evidence.get("field_mappings"):
        reasons.append("audit_mapping_inventory_empty")
    if not evidence.get("forensic_inventory"):
        reasons.append("audit_inventory_missing")
    allowed_statuses = {"MAPPED", "DERIVED", "RAW_ONLY_INTENTIONAL", "NOT_PRESENT_IN_DEMO", "UNAVAILABLE", "PARSE_FAILED", "UNMAPPED_BUT_AVAILABLE"}
    for item in evidence["field_mappings"]:
        if item.get("status") not in allowed_statuses:
            reasons.append(f"unknown_mapping_status:{item.get('raw_field', '[unknown]')}:{item.get('status')}")
        elif item["status"] == "PARSE_FAILED":
            failed = True
            reasons.append(f"parse_failed:{item['raw_field']}")
        elif item["status"] == "UNMAPPED_BUT_AVAILABLE":
            reasons.append(f"unmapped_but_available:{item['raw_field']}")
        elif item["status"] == "RAW_ONLY_INTENTIONAL" and not item.get("reason"):
            reasons.append(f"raw_only_reason_missing:{item['raw_field']}")
    for gate in evidence.get("gates") or []:
        if gate["status"] != "PASS":
            reasons.append(f"gate:{gate['gate']}")
    return ("FAIL" if failed else "BLOCKED" if reasons else "PASS", sorted(set(reasons)))


def prepare_evidence(evidence: dict[str, Any], *, parser: dict[str, Any], contract_version: int,
                     demo_sha256: str, file_size: int) -> dict[str, Any]:
    manifest = evidence["manifest"]
    manifest.update({"parser_name": parser.get("name"), "parser_version": parser.get("version"),
                     "parser_revision": parser.get("revision"), "contract_version": contract_version,
                     "demo_sha256": demo_sha256.lower(), "file_size": file_size})
    evidence["gates"] = build_gates(evidence)
    evidence["forensic_inventory"] = forensic_inventory(evidence)
    evidence["raw_status"], evidence["raw_block_reasons"] = raw_audit_status(evidence)
    evidence["raw_audit_status"] = "APPROVED" if evidence["raw_status"] == "PASS" else "BLOCKED"
    evidence["audit_surface_version"] = AUDIT_SURFACE_VERSION
    forensic_v2 = evidence.get("forensic_contract_v2")
    if isinstance(forensic_v2, dict):
        forensic_v2["parser"] = {"name": parser.get("name"), "version": parser.get("version")}
        for gate in forensic_v2.get("gates") or []:
            if gate.get("gate") == "RAW-V2-01-parser-identity":
                passed = parser.get("name") == "demoparser2" and parser.get("version") == "0.42.0" and contract_version == 1
                gate.update({"status": "PASS" if passed else "BLOCKED", "reasons": [] if passed else ["parser_identity_mismatch"]})
        unsigned = {key: value for key, value in forensic_v2.items() if key != "deterministic_digest"}
        forensic_v2["deterministic_digest"] = deterministic_digest(unsigned)
    return evidence


def finalize_evidence(evidence: dict[str, Any], *, parser: dict[str, Any], contract_version: int,
                      demo_sha256: str, file_size: int) -> dict[str, Any]:
    evidence = prepare_evidence(evidence, parser=parser, contract_version=contract_version,
                                demo_sha256=demo_sha256, file_size=file_size)
    clean = _safe(evidence)
    clean["manifest"]["estimated_evidence_bytes"] = len(stable_json(clean).encode("utf-8"))
    clean["deterministic_digest"] = evidence_digest(clean)
    return clean
