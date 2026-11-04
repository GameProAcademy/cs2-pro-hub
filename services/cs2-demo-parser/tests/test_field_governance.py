"""Field governance: classifications are explicit, consistent and checked against real consumption.

The classification of a raw field lives in raw_evidence.py (MAPPED_RAW_FIELDS and the reviewed
tables). These tests prove, by perturbing inputs to the actual consumers, that:

- every field the adapter or the hot payload reads is MAPPED/DERIVED (CANONICAL);
- no RAW_ONLY or IGNORED_APPROVED field changes any downstream output;
- unknown fields and unknown events still block admission (UNMAPPED);
- player_disconnect.ever_fully_connected stays RAW_ONLY and is never consumed.
"""
from __future__ import annotations

import copy
import json

import pytest

import adapter
import hot_payload
import raw_evidence as r

CANONICAL_STATUSES = {"MAPPED", "DERIVED"}


def _value(field: str):
    if "steamid" in field or field in {"xuid", "networkid"}:
        return "76561198000000001"
    if field in {"weapon", "weapon_name", "active_weapon_name", "last_place_name", "move_state", "name", "player_name"}:
        return "ak47"
    if field.startswith(("is_", "has_")) or field in {
        "headshot", "noscope", "attackerblind", "assistedflash", "ducked", "ducking", "ever_fully_connected",
    }:
        return True
    return 3


def _alternative(value):
    if isinstance(value, bool):
        return not value
    if isinstance(value, str):
        return "76561198000000002" if value.isdigit() else "m4a1"
    return 7


def _classify(field: str) -> dict:
    """Classify one dotted field through the production inventory code."""
    family, native = field.split(".", 1)
    raw = {"header": {}, "players": [], "event_tables": {}, "tick_rows": [], "grenade_rows": [], "round_rows": []}
    if family == "game_state":
        raw["tick_rows"] = [{native: 1}]
    else:
        raw["event_tables"] = {family: [{native: 1}]}
    rows = [row for row in r.mapping_inventory(raw) if row["raw_field"] == field]
    assert len(rows) == 1, field
    return rows[0]


def _event_field_universe(event: str) -> set[str]:
    fields = set(r.REVIEWED_EVENT_FIELDS)
    fields |= set(r.REVIEWED_RAW_ONLY_EVENT_FIELDS.get(event, ()))
    fields |= set(r.REVIEWED_IGNORED_EVENT_FIELDS.get(event, ()))
    fields |= {key.split(".", 1)[1] for key in r.MAPPED_RAW_FIELDS if key.startswith(f"{event}.")}
    fields.discard("__event__")
    return fields


def _consumed_event_fields(event: str) -> set[str]:
    fields = _event_field_universe(event)
    row = {field: _value(field) for field in fields}
    baseline = adapter._event_fields(event, row)
    consumed = set()
    for field in fields:
        changed = dict(row, **{field: _alternative(row[field])})
        removed = {k: v for k, v in row.items() if k != field}
        if adapter._event_fields(event, changed) != baseline or adapter._event_fields(event, removed) != baseline:
            consumed.add(field)
    return consumed


def test_canonical_event_types_equal_the_adapter_emitted_events():
    assert tuple(r.CANONICAL_EVENT_TYPES) == tuple(adapter.SUPPORTED_EVENTS)


@pytest.mark.parametrize("event", adapter.SUPPORTED_EVENTS)
def test_every_field_the_adapter_reads_is_canonical(event):
    for field in sorted(_consumed_event_fields(event)):
        row = _classify(f"{event}.{field}")
        assert row["status"] in CANONICAL_STATUSES, (
            f"{event}.{field} feeds CanonicalEvent but is classified {row['status']}"
        )
        assert row["app_field"] and row["canonical_field"], f"{event}.{field} lacks its targets"


@pytest.mark.parametrize("event", adapter.SUPPORTED_EVENTS)
def test_no_raw_only_or_ignored_field_changes_the_adapter_output(event):
    consumed = _consumed_event_fields(event)
    for field in sorted(_event_field_universe(event) - {"tick", "round"}):
        status = _classify(f"{event}.{field}")["status"]
        if status == "RAW_ONLY_INTENTIONAL":
            assert field not in consumed, f"RAW_ONLY {event}.{field} is consumed by adapter.py"


def test_event_tick_and_round_of_emitted_events_are_derived():
    for event in adapter.SUPPORTED_EVENTS:
        tick = _classify(f"{event}.tick")
        assert tick["status"] == "DERIVED", event
        if event not in {"round_start", "round_end"}:
            assert tick["canonical_field"] == "CanonicalEvent.tick", event
            assert _classify(f"{event}.round")["canonical_field"] == "CanonicalEvent.roundNumber", event


def test_events_the_adapter_does_not_emit_never_feed_canonical_events():
    # inferno_startburn is in adapter._GRENADE_EVENTS but not in SUPPORTED_EVENTS: never emitted.
    assert "inferno_startburn" not in adapter.SUPPORTED_EVENTS
    assert _classify("inferno_startburn.user_steamid")["status"] == "RAW_ONLY_INTENTIONAL"
    raw = {"player_disconnect": [{"tick": 10, "user_steamid": "76561198000000001", "ever_fully_connected": True}]}
    output = adapter.build_raw_parser_output(raw)
    assert not [e for e in output.get("events") or [] if e.get("type") == "player_disconnect"]


def _semantic_rows(source: dict) -> dict:
    return hot_payload._semantic_tick_rows({"tick_samples": [source]})


def test_semantic_tick_fields_equal_what_the_hot_payload_reads():
    universe = set(r.PLAYER_PROPERTIES) | {"player_steamid", "steamid", "tick", "round", "team_number", "game_time"}
    consumed = set()
    # Second pass without the primary keys, so fallbacks (round, team_number, steamid) show up.
    for drop in (set(), {"total_rounds_played", "team_num", "player_steamid"}):
        base = {field: _value(field) for field in universe - drop}
        baseline = _semantic_rows(base)
        for field in base:
            changed = dict(base, **{field: _alternative(base[field])})
            removed = {k: v for k, v in base.items() if k != field}
            if _semantic_rows(changed) != baseline or _semantic_rows(removed) != baseline:
                consumed.add(field)
    declared = {f for fields in r.SEMANTIC_TICK_FIELDS.values() for f in fields}
    # tick/steamid/total_rounds_played were already MAPPED/DERIVED before the governance review.
    assert consumed - {"tick", "steamid", "total_rounds_played"} == declared
    for field in consumed:
        assert _classify(f"game_state.{field}")["status"] in CANONICAL_STATUSES, field


def test_raw_only_game_state_never_reaches_the_hot_payload():
    base = {field: _value(field) for field in r.PLAYER_PROPERTIES}
    baseline = _semantic_rows(base)
    for field in r.PLAYER_PROPERTIES:
        if _classify(f"game_state.{field}")["status"] != "RAW_ONLY_INTENTIONAL":
            continue
        changed = dict(base, **{field: _alternative(base[field])})
        assert _semantic_rows(changed) == baseline, f"RAW_ONLY game_state.{field} reaches the hot payload"


def test_ever_fully_connected_is_raw_only_preserved_and_never_consumed():
    row = _classify("player_disconnect.ever_fully_connected")
    assert row["status"] == "RAW_ONLY_INTENTIONAL"
    assert row["reason"]
    assert row["app_field"] is None and row["canonical_field"] is None
    assert "player_disconnect" not in adapter.SUPPORTED_EVENTS
    assert "player_disconnect" not in hot_payload._CLASSIFIED
    # Preserved verbatim in RAW evidence.
    events = r.raw_events({"player_disconnect": [{"tick": 1, "ever_fully_connected": True}]})
    assert events[0]["raw_fields"]["ever_fully_connected"] is True


def test_each_field_has_exactly_one_class():
    for event, fields in r.REVIEWED_IGNORED_EVENT_FIELDS.items():
        overlap = fields & r.REVIEWED_RAW_ONLY_EVENT_FIELDS.get(event, frozenset())
        assert not overlap, f"{event}: {sorted(overlap)} both RAW_ONLY and IGNORED_APPROVED"
        assert not {f"{event}.{f}" for f in fields} & set(r.MAPPED_RAW_FIELDS), event
    for key in r.MAPPED_RAW_FIELDS:
        event, field = key.split(".", 1)
        assert field not in r.REVIEWED_RAW_ONLY_EVENT_FIELDS.get(event, frozenset()), key


def test_ignored_approved_is_explicit_non_blocking_and_distinguishable():
    row = _classify("hltv_fixed.fov")
    assert row["status"] == "RAW_ONLY_INTENTIONAL"
    assert row["reason"] == r.IGNORED_APPROVED_REASON
    assert _classify("fire_bullets.seed")["reason"] != r.IGNORED_APPROVED_REASON


def test_unknown_fields_and_unknown_events_still_block():
    assert _classify("player_death.brand_new_field")["status"] == "UNMAPPED_BUT_AVAILABLE"
    assert _classify("player_disconnect.brand_new_field")["status"] == "UNMAPPED_BUT_AVAILABLE"
    assert _classify("brand_new_event.tick")["status"] == "UNMAPPED_BUT_AVAILABLE"
    evidence = {
        "gates": [{"gate": "RAW", "status": "PASS"}],
        "forensic_inventory": {"present": True},
        "field_mappings": [{"raw_field": "player_death.brand_new_field", "status": "UNMAPPED_BUT_AVAILABLE"}],
    }
    status, reasons = r.raw_audit_status(evidence)
    assert status == "BLOCKED"
    assert "unmapped_but_available:player_death.brand_new_field" in reasons


def test_demo_content_cannot_change_a_classification():
    # Field NAMES are looked up in fixed code tables; values and extra keys are never trusted.
    raw = {"event_tables": {"player_death": [{"assistedflash": {"status": "RAW_ONLY_INTENTIONAL"}}]}}
    rows = {row["raw_field"]: row for row in r.mapping_inventory(raw)}
    assert rows["player_death.assistedflash"]["status"] == "MAPPED"
    before = copy.deepcopy(dict(r.MAPPED_RAW_FIELDS))
    r.mapping_inventory({"event_tables": {"x": [{"MAPPED_RAW_FIELDS": 1}]}})
    assert dict(r.MAPPED_RAW_FIELDS) == before
    assert json.dumps(rows["player_death.assistedflash"])  # serialisable, no live objects
