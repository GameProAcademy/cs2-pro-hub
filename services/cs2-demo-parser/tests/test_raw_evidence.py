import json

from parser import build_raw_evidence, enrich_rounds_from_tick_evidence
from raw_evidence import build_gates, event_coverage, evidence_digest, finalize_evidence, raw_events


def material():
    return {
        "header": {"map_name": "de_cache", "playback_ticks": 6400},
        "players": [{"steamid": "76561198000000001", "name": "alpha", "balance": None}],
        "event_tables": {
            "player_death": [{"tick": 20, "round": 1, "headshot": False, "unknown_native": 0}],
            "weapon_fire": [], "player_hurt": None,
        },
        "event_errors": {"player_hurt": RuntimeError("stream failed")},
        "event_inventory_error": None,
        "tick_rows": [{"tick": 10, "player_steamid": "76561198000000001", "X": 0.0, "balance": None}],
        "tick_error": None, "grenade_rows": [], "grenade_error": None,
    }


def output():
    return {"header": {"tickrate": 64}, "players": [{"steam_id": "76561198000000001"}],
            "rounds": [{"number": 1}], "events": [{"type": "player_death"}], "warnings": []}


def test_empty_event_is_distinct_from_unavailable_and_failed():
    empty = event_coverage("weapon_fire", True, [])
    missing = event_coverage("unknown", False, None)
    failed = event_coverage("player_hurt", True, None, RuntimeError("failed"))
    assert empty["parse_success"] is True and empty["row_count"] == 0
    assert missing["parse_attempted"] is False and missing["row_count"] is None
    assert failed["parse_attempted"] is True and failed["parse_success"] is False


def test_raw_event_keeps_native_fields_and_false_zero_values():
    row = raw_events(material()["event_tables"])[0]
    assert row["raw_fields"]["unknown_native"] == 0
    assert row["raw_fields"]["headshot"] is False


def test_manifest_coverage_mapping_and_null_semantics_are_deterministic():
    first = build_raw_evidence(material(), output())
    second = build_raw_evidence(material(), output())
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    assert first["manifest"]["map"] == "de_cache"
    balance = next(item for item in first["tick_coverage"] if item["property"] == "balance")
    assert balance["available"] is False and balance["sample"] is None
    unmapped = next(item for item in first["field_mappings"] if item["raw_field"] == "player_death.unknown_native")
    assert unmapped["status"] == "UNMAPPED_BUT_AVAILABLE"


def test_finalize_binds_worker_and_demo_identity_and_digest():
    final = finalize_evidence(build_raw_evidence(material(), output()),
                              parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:a"},
                              contract_version=1, demo_sha256="a" * 64, file_size=99)
    assert final["manifest"]["demo_sha256"] == "a" * 64
    digest = final.pop("deterministic_digest")
    assert digest == evidence_digest(final)


def test_round_player_material_is_only_projected_from_observed_tick_rows():
    raw = {
        "tick_rows": [
            {"tick": 100, "player_steamid": "76561198000000001", "team_num": 3,
             "balance": 800, "current_equip_value": 0},
            {"tick": 200, "player_steamid": "76561198000000001", "balance": 350},
        ]
    }
    parsed = {"rounds": [{"number": 1, "start_tick": 100, "end_tick": 200},
                          {"number": 2, "start_tick": 300, "end_tick": 400}]}
    enrich_rounds_from_tick_evidence(raw, parsed)
    assert parsed["rounds"][0]["sides"] == {"76561198000000001": "CT"}
    assert parsed["rounds"][0]["money_start"] == {"76561198000000001": 800}
    assert parsed["rounds"][0]["equipment_value"] == {"76561198000000001": 0}
    assert parsed["rounds"][0]["money_end"] == {"76561198000000001": 350}
    assert set(parsed["rounds"][1]) == {"number", "start_tick", "end_tick"}


def test_gates_fail_closed_when_a_stream_or_capability_fails():
    evidence = build_raw_evidence(material(), output())
    manifest = evidence["manifest"]
    manifest.update({"demo_sha256": "a" * 64, "parser_name": "demoparser2", "parser_version": "0.42.0"})
    gates = {item["gate"]: item["status"] for item in build_gates(evidence)}
    assert gates["EVENT-COVERAGE"] == "FAIL"
    assert gates["RAW-EVIDENCE-01"] == "FAIL"
