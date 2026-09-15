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
        "event_inventory": ["player_death", "player_hurt", "weapon_fire"],
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
    assert empty["capability_state"] == "AVAILABLE_BUT_EMPTY"
    assert missing["capability_state"] == "NOT_PRESENT_IN_DEMO"
    assert failed["capability_state"] == "PARSE_FAILED"


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
    assert final["manifest"]["tick_sampling"]["coverage"] == "SAMPLE"
    assert final["forensic_inventory"]["all_event_inventory"] == sorted(material()["event_inventory"])


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


def test_tick_limit_and_high_value_candidates_are_explicit():
    from raw_evidence import EVENT_CANDIDATES, TICK_SAMPLE_LIMIT
    assert TICK_SAMPLE_LIMIT == 4096
    assert {"bullet_damage", "bullet_impact", "weapon_fire", "grenade_thrown", "player_blind"} <= set(EVENT_CANDIDATES)


def test_player_blind_is_collected_mapped_and_preserves_unknown_semantics():
    raw = material()
    raw["event_inventory"].append("player_blind")
    raw["event_tables"]["player_blind"] = [
        {
            "tick": 18,
            "round": 1,
            "attacker_steamid": "76561198000000001",
            "user_steamid": "76561198000000002",
            "blind_duration": 1.9,
        }
    ]

    evidence = build_raw_evidence(raw, output())
    coverage = next(item for item in evidence["event_coverage"] if item["event_name"] == "player_blind")
    duration = next(
        item for item in evidence["field_mappings"]
        if item["raw_field"] == "player_blind.blind_duration"
    )
    event = next(item for item in evidence["raw_events"] if item["event_name"] == "player_blind")

    assert coverage["capability_state"] == "PARSED_SUCCESSFULLY"
    assert coverage["row_count"] == 1
    assert duration["status"] == "MAPPED"
    assert event["raw_fields"]["blind_duration"] == 1.9

    absent = event_coverage("player_blind", False, None)
    assert absent["capability_state"] == "NOT_PRESENT_IN_DEMO"
    assert absent["row_count"] is None


def test_extract_raw_material_selects_player_blind_when_available():
    from parser import extract_raw_material

    class Demo:
        def parse_header(self):
            return {}

        def list_game_events(self):
            return ["player_blind"]

        def parse_event(self, name, *_args):
            assert name == "player_blind"
            return [{"tick": 18, "round": 1, "blind_duration": 1.9}]

        def parse_player_info(self):
            return []

        def parse_ticks(self, *_args, **_kwargs):
            return []

        def parse_grenades(self):
            return []

    raw = extract_raw_material(Demo())

    assert raw["event_tables"]["player_blind"][0]["blind_duration"] == 1.9
    assert raw["player_blind"][0]["blind_duration"] == 1.9


def test_reviewed_raw_only_field_has_reason_and_unknown_field_fails_gate():
    reviewed = material()
    reviewed["players"][0]["kills_total"] = 7
    mapped = build_raw_evidence(reviewed, output())["field_mappings"]
    aggregate = next(item for item in mapped if item["raw_field"] == "player.kills_total")
    assert aggregate["status"] == "RAW_ONLY_INTENTIONAL"
    assert aggregate["reason"]
    unknown = next(item for item in mapped if item["raw_field"] == "player_death.unknown_native")
    assert unknown["status"] == "UNMAPPED_BUT_AVAILABLE"


def test_unknown_field_is_preserved_and_blocks_instead_of_disappearing():
    final = finalize_evidence(build_raw_evidence(material(), output()),
                              parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:a"},
                              contract_version=1, demo_sha256="a" * 64, file_size=99)
    assert final["raw_status"] == "BLOCKED"
    assert "unmapped_but_available:player_death.unknown_native" in final["raw_block_reasons"]
    assert any(item["raw_field"] == "player_death.unknown_native"
               for item in final["forensic_inventory"]["mapping_inventory"])


def test_forensic_inventory_has_explicit_grenade_usercmd_team_and_score_families():
    evidence = build_raw_evidence(material(), output())
    evidence["grenade_coverage"] = [{"property": "grenade_type"}]
    evidence["tick_coverage"] = [{"property": "shots_fired"}, {"property": "X"}]
    evidence["player_coverage"] = [{"property": "team_num"}, {"property": "score"}]
    final = finalize_evidence(evidence,
                              parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:a"},
                              contract_version=1, demo_sha256="a" * 64, file_size=99)
    inventory = final["forensic_inventory"]
    assert inventory["grenade_inventory"] == ["grenade_type"]
    assert inventory["usercmd_inventory"] == ["shots_fired"]
    assert inventory["teams_inventory"] == ["team_num"]
    assert inventory["score_inventory"] == ["score"]
    assert inventory["movement_inventory"] == ["X"]


def test_not_present_event_is_not_itself_a_raw_audit_failure():
    evidence = build_raw_evidence(material(), output())
    evidence["event_coverage"] = [event_coverage("not_in_demo", False, None)]
    evidence["field_mappings"] = []
    evidence["gates"] = []
    from raw_evidence import raw_audit_status
    assert raw_audit_status(evidence) == (
        "BLOCKED",
        ["audit_gates_empty", "audit_inventory_missing", "audit_mapping_inventory_empty"],
    )


def test_unknown_advertised_event_and_every_returned_field_are_preserved_and_blocked():
    raw = material()
    raw["event_inventory"].append("future_event")
    raw["event_tables"]["future_event"] = [{"tick": 44, "future_field": 123}]
    final = finalize_evidence(
        build_raw_evidence(raw, output()),
        parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:a"},
        contract_version=1, demo_sha256="a" * 64, file_size=99,
    )
    event = next(item for item in final["raw_events"] if item["event_name"] == "future_event")
    assert event["raw_fields"]["future_field"] == 123
    assert any(item["raw_field"] == "future_event.__event__" and item["status"] == "UNMAPPED_BUT_AVAILABLE"
               for item in final["field_mappings"])
    assert any(item["raw_field"] == "future_event.future_field" and item["status"] == "UNMAPPED_BUT_AVAILABLE"
               for item in final["field_mappings"])
    assert final["raw_audit_status"] == "BLOCKED"


def test_raw_header_and_unknown_player_grenade_and_game_state_fields_survive():
    raw = material()
    raw["header"]["future_header"] = "kept"
    raw["players"][0]["future_player"] = False
    raw["tick_rows"][0]["future_state"] = 0
    raw["grenade_rows"] = [{"tick": 15, "future_grenade": "kept"}]
    final = finalize_evidence(
        build_raw_evidence(raw, output()),
        parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:a"},
        contract_version=1, demo_sha256="a" * 64, file_size=99,
    )
    assert final["manifest"]["raw_header"]["future_header"] == "kept"
    assert final["raw_player_info"][0]["future_player"] is False
    assert final["tick_samples"][0]["future_state"] == 0
    assert final["grenade_samples"][0]["future_grenade"] == "kept"
    expected = {"header.future_header", "player.future_player", "game_state.future_state", "grenade.future_grenade"}
    blocked = {item["raw_field"] for item in final["field_mappings"] if item["status"] == "UNMAPPED_BUT_AVAILABLE"}
    assert expected <= blocked
    assert final["raw_audit_status"] == "BLOCKED"


def test_tick_sampling_never_claims_complete_and_records_bounds():
    final = finalize_evidence(
        build_raw_evidence(material(), output()),
        parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:a"},
        contract_version=1, demo_sha256="a" * 64, file_size=99,
    )
    sampling = final["manifest"]["tick_sampling"]
    assert sampling["coverage"] == "SAMPLE"
    assert sampling["full_extraction"] is False
    assert sampling["sample_size"] == 1
    assert sampling["first_sampled_tick"] == sampling["last_sampled_tick"] == 10
