import json
from pathlib import Path

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


def test_event_fields_distinguish_returned_non_null_null_only_and_missing():
    coverage = event_coverage("player_hurt", True, [
        {"tick": 1, "weapon": None, "attacker": "a"},
        {"tick": 2, "weapon": None},
    ])
    assert coverage["returned_fields"] == ["attacker", "tick", "weapon"]
    assert coverage["non_null_fields"] == ["attacker", "tick"]
    assert coverage["null_only_fields"] == ["weapon"]
    assert coverage["preserved_fields"] == coverage["returned_fields"]
    assert coverage["fields_missing"] == ["attacker"]


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
    game_state = final["forensic_inventory"]
    assert "health" in game_state["game_state_capability"]
    assert game_state["game_state_returned"] == sorted(material()["tick_rows"][0])
    assert game_state["game_state_observed_in_sample"] == game_state["game_state_returned"]


def test_digest_is_key_order_stable_and_changes_with_raw_content():
    first = build_raw_evidence(material(), output())
    reordered = {key: first[key] for key in reversed(first)}
    assert evidence_digest(first) == evidence_digest(reordered)
    changed = json.loads(json.dumps(first))
    changed["raw_player_info"][0]["name"] = "changed"
    assert evidence_digest(first) != evidence_digest(changed)


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


def test_real_cache_reviewed_raw_fields_do_not_weaken_unknown_field_gate():
    raw = material()
    raw["header"]["patch_version"] = "1.40.8.1"
    raw["event_inventory"].extend(["fire_bullets", "round_freeze_end"])
    raw["event_tables"].update({
        "fire_bullets": [{"tick": 30, "round": 1, "inaccuracy": 0.02, "seed": 9}],
        "round_freeze_end": [{"tick": 10}],
    })
    raw["grenade_rows"] = [{
        "tick": 15, "grenade_entity_id": 7, "grenade_type": "smoke",
        "steamid": 76561198000000001, "name": "alpha", "x": 1.0, "y": 2.0, "z": 3.0,
    }]
    mappings = build_raw_evidence(raw, output())["field_mappings"]
    by_field = {item["raw_field"]: item for item in mappings}
    assert by_field["header.patch_version"]["status"] == "RAW_ONLY_INTENTIONAL"
    assert by_field["grenade.grenade_entity_id"]["status"] == "RAW_ONLY_INTENTIONAL"
    assert by_field["fire_bullets.inaccuracy"]["status"] == "RAW_ONLY_INTENTIONAL"
    assert by_field["round_freeze_end.__event__"]["status"] == "RAW_ONLY_INTENTIONAL"
    assert all(by_field[field]["reason"] for field in (
        "header.patch_version", "grenade.grenade_entity_id",
        "fire_bullets.inaccuracy", "round_freeze_end.__event__",
    ))

    raw["grenade_rows"][0]["future_grenade"] = "unknown"
    blocked = build_raw_evidence(raw, output())["field_mappings"]
    future = next(item for item in blocked if item["raw_field"] == "grenade.future_grenade")
    assert future["status"] == "UNMAPPED_BUT_AVAILABLE"


def test_game_state_identity_aliases_are_explicitly_catalogued():
    raw = material()
    raw["tick_rows"] = [{"tick": 100, "steamid": 76561198000000001, "name": "alpha"}]
    mappings = build_raw_evidence(raw, output())["field_mappings"]
    by_field = {item["raw_field"]: item for item in mappings}
    assert by_field["game_state.tick"]["status"] == "MAPPED"
    assert by_field["game_state.steamid"]["status"] == "MAPPED"
    assert by_field["game_state.name"]["status"] == "MAPPED"


def test_unknown_mapping_status_fails_closed():
    evidence = build_raw_evidence(material(), output())
    evidence["field_mappings"].append({
        "raw_field": "future.status", "app_field": None, "canonical_field": None,
        "status": "FUTURE_STATUS", "reason": None,
    })
    final = finalize_evidence(
        evidence,
        parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:a"},
        contract_version=1, demo_sha256="a" * 64, file_size=99,
    )
    assert final["raw_status"] == "BLOCKED"
    assert "unknown_mapping_status:future.status:FUTURE_STATUS" in final["raw_block_reasons"]


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


def test_cache_g2_legacy_unmapped_inventory_is_fully_and_explicitly_classified():
    fixture = json.loads(
        (Path(__file__).parent / "fixtures" / "cache_raw_audit_g2.json").read_text(encoding="utf-8")
    )
    fields = fixture["legacy_unmapped_fields"]
    assert len(fields) == fixture["expected_legacy_unmapped_count"] == 178
    assert len(set(fields)) == len(fields)

    raw = {
        "header": {}, "players": [{}], "event_tables": {},
        "tick_rows": [{}], "grenade_rows": [{}], "round_rows": [{}],
    }
    for field in fields:
        family, native = field.split(".", 1)
        if family == "header": raw["header"][native] = 1
        elif family == "player": raw["players"][0][native] = 1
        elif family == "game_state": raw["tick_rows"][0][native] = 1
        elif family == "grenade": raw["grenade_rows"][0][native] = 1
        elif family == "round": raw["round_rows"][0][native] = 1
        else: raw["event_tables"].setdefault(family, [{}])[0][native] = 1

    from raw_evidence import mapping_inventory
    classified = {item["raw_field"]: item for item in mapping_inventory(raw)}
    counts = {
        status: sum(item["status"] == status for item in classified.values())
        for status in fixture["expected_current_counts"]
    }
    assert counts == fixture["expected_current_counts"]
    assert not [item for item in classified.values() if item["status"] == "UNMAPPED_BUT_AVAILABLE"]
    assert all(item.get("reason") for item in classified.values() if item["status"] == "RAW_ONLY_INTENTIONAL")
    assert {field for field, item in classified.items() if item["status"] == "MAPPED"} == {
        "game_state.name", "game_state.steamid", "game_state.tick", "player_death.attackerblind",
    }


def test_raw_only_without_reason_and_parse_failed_are_fail_closed():
    from raw_evidence import raw_audit_status
    base = {"gates": [{"gate": "RAW", "status": "PASS"}], "forensic_inventory": {"present": True}}
    missing_reason = {**base, "field_mappings": [
        {"raw_field": "header.server_name", "status": "RAW_ONLY_INTENTIONAL", "reason": None},
    ]}
    assert raw_audit_status(missing_reason) == (
        "BLOCKED", ["raw_only_reason_missing:header.server_name"],
    )
    parse_failed = {**base, "field_mappings": [
        {"raw_field": "event.failed", "status": "PARSE_FAILED", "reason": "parser failure"},
    ]}
    assert raw_audit_status(parse_failed) == ("FAIL", ["parse_failed:event.failed"])


# The exact UNMAPPED_BUT_AVAILABLE fields reported by the sealed RAW manifests of the
# production jobs 4b5e3530 (reference DEM, attempt 10) and 98dda0f8 on 2026-10-14.
PRODUCTION_2026_10_14_UNMAPPED = (
    "header.demo_version_name", "player.team_number",
    "begin_new_match.__event__", "begin_new_match.tick",
    "round_announce_warmup.__event__", "round_announce_warmup.tick",
    "hltv_fixed.__event__", "hltv_fixed.fov", "hltv_fixed.offset", "hltv_fixed.phi",
    "hltv_fixed.posx", "hltv_fixed.posy", "hltv_fixed.posz", "hltv_fixed.target",
    "hltv_fixed.theta", "hltv_fixed.tick",
)


def test_fields_observed_in_production_on_2026_10_14_are_classified_and_unknown_ones_still_block():
    from raw_evidence import mapping_inventory
    raw = {"header": {}, "players": [{}], "event_tables": {}, "tick_rows": [], "grenade_rows": [], "round_rows": []}
    for field in PRODUCTION_2026_10_14_UNMAPPED:
        family, native = field.split(".", 1)
        if family == "header": raw["header"][native] = "x"
        elif family == "player": raw["players"][0][native] = 2
        elif native == "__event__": raw["event_tables"].setdefault(family, [{}])
        else: raw["event_tables"].setdefault(family, [{}])[0][native] = 1
    classified = {item["raw_field"]: item for item in mapping_inventory(raw)}
    assert set(PRODUCTION_2026_10_14_UNMAPPED) <= set(classified)
    for field in PRODUCTION_2026_10_14_UNMAPPED:
        item = classified[field]
        assert item["status"] != "UNMAPPED_BUT_AVAILABLE", field
        assert item["status"] != "RAW_ONLY_INTENTIONAL" or item["reason"], field
    # The two fields the adapter consumes are MAPPED to what it produces, not hidden as RAW only.
    assert classified["player.team_number"]["app_field"] == "players[].team"
    assert classified["player.team_number"]["canonical_field"] == "CanonicalParticipant.team"
    assert classified["header.demo_version_name"]["app_field"] == "header.game_version"
    # A field of the same events that was not reviewed still blocks.
    raw["event_tables"]["hltv_fixed"][0]["future_camera_field"] = 1
    raw["players"][0]["future_player_field"] = 1
    again = {item["raw_field"]: item["status"] for item in mapping_inventory(raw)}
    assert again["hltv_fixed.future_camera_field"] == "UNMAPPED_BUT_AVAILABLE"
    assert again["player.future_player_field"] == "UNMAPPED_BUT_AVAILABLE"


# Every UNMAPPED_BUT_AVAILABLE field the RAW audit reported for the pinned public fixture
# (LaihoE/demoparser test_demo.dem @4131a4fc, sha256 84a1a419...; the CI end-to-end demo),
# measured locally with demoparser2 0.42.0 on 2026-10-14.
PUBLIC_FIXTURE_UNMAPPED = (
    "bomb_begindefuse.haskit",
    "buytime_ended.__event__",
    "buytime_ended.tick",
    "cs_win_panel_round.__event__",
    "cs_win_panel_round.final_event",
    "cs_win_panel_round.funfact_data1",
    "cs_win_panel_round.funfact_data2",
    "cs_win_panel_round.funfact_data3",
    "cs_win_panel_round.funfact_player",
    "cs_win_panel_round.funfact_token",
    "cs_win_panel_round.show_timer_attack",
    "cs_win_panel_round.show_timer_defend",
    "cs_win_panel_round.tick",
    "cs_win_panel_round.timer_time",
    "item_equip.canzoom",
    "item_equip.defindex",
    "item_equip.hassilencer",
    "item_equip.hastracers",
    "item_equip.ispainted",
    "item_equip.issilenced",
    "item_equip.item",
    "item_equip.weptype",
    "other_death.__event__",
    "other_death.attacker_name",
    "other_death.attacker_steamid",
    "other_death.attackerblind",
    "other_death.headshot",
    "other_death.noscope",
    "other_death.otherid",
    "other_death.othertype",
    "other_death.penetrated",
    "other_death.thrusmoke",
    "other_death.tick",
    "other_death.weapon",
    "other_death.weapon_fauxitemid",
    "other_death.weapon_itemid",
    "other_death.weapon_originalowner_xuid",
    "player_blind.entityid",
    "player_disconnect.PlayerID",
    "player_disconnect.__event__",
    "player_disconnect.name",
    "player_disconnect.networkid",
    "player_disconnect.reason",
    "player_disconnect.tick",
    "player_disconnect.user_name",
    "player_disconnect.user_steamid",
    "player_disconnect.xuid",
    "player_footstep.__event__",
    "player_footstep.tick",
    "player_footstep.user_name",
    "player_footstep.user_steamid",
    "player_jump.__event__",
    "player_jump.tick",
    "player_jump.user_name",
    "player_jump.user_steamid",
    "rank_update.__event__",
    "rank_update.num_wins",
    "rank_update.rank_change",
    "rank_update.rank_new",
    "rank_update.rank_old",
    "rank_update.rank_type_id",
    "rank_update.tick",
    "rank_update.user_name",
    "rank_update.user_steamid",
    "round_end.legacy",
    "round_end.message",
    "round_end.nomusic",
    "round_end.player_count",
    "round_end.reason",
    "round_mvp.musickitid",
    "round_mvp.musickitmvps",
    "round_mvp.nomusic",
    "round_mvp.reason",
    "round_mvp.value",
    "round_officially_ended.__event__",
    "round_officially_ended.tick",
    "round_poststart.__event__",
    "round_poststart.tick",
    "round_prestart.__event__",
    "round_prestart.tick",
    "round_start.fraglimit",
    "round_start.objective",
    "round_start.timelimit",
)


def test_public_fixture_fields_are_classified_raw_only_and_unknown_ones_still_block():
    from raw_evidence import mapping_inventory
    raw = {"header": {}, "players": [{}], "event_tables": {}, "tick_rows": [], "grenade_rows": [], "round_rows": []}
    for field in PUBLIC_FIXTURE_UNMAPPED:
        family, native = field.split(".", 1)
        if native == "__event__":
            raw["event_tables"].setdefault(family, [{}])
        else:
            raw["event_tables"].setdefault(family, [{}])[0][native] = 1
    classified = {item["raw_field"]: item for item in mapping_inventory(raw)}
    for field in PUBLIC_FIXTURE_UNMAPPED:
        item = classified[field]
        # Reviewed as RAW only: none of them is read by the adapter or the Canonical mapping.
        assert item["status"] == "RAW_ONLY_INTENTIONAL", (field, item["status"])
        assert item["reason"], field
        assert item.get("canonical_field") in (None, ""), field
    # The winning side still comes from round_end.winner, not from the newly reviewed round_end.reason.
    raw["event_tables"]["round_end"][0]["winner"] = 3
    assert {i["raw_field"]: i for i in mapping_inventory(raw)}["round_end.winner"]["canonical_field"] == "CanonicalRound.winningSide"
    raw["event_tables"]["rank_update"][0]["future_rank_field"] = 1
    raw["event_tables"]["player_footstep"][0]["future_step_field"] = 1
    again = {item["raw_field"]: item["status"] for item in mapping_inventory(raw)}
    assert again["rank_update.future_rank_field"] == "UNMAPPED_BUT_AVAILABLE"
    assert again["player_footstep.future_step_field"] == "UNMAPPED_BUT_AVAILABLE"


def _app_stable(value):
    """The APP's stableRawArtifactJson, applied to what JSON carried (src/lib/pipeline/rawArtifactContract.ts)."""
    from raw_artifact import _stable_portable
    return _stable_portable(json.loads(json.dumps(value)))


def test_forensic_v2_contract_digest_is_reproducible_by_the_app_after_json_round_trip():
    # Production jobs published contracts whose digest no consumer could reproduce: it was
    # computed before _safe turned 0.0 into 0 (coverage_ratio, tick values) and with Python
    # float text. The digest must hold over the published, JSON-carried contract.
    import hashlib
    from forensic_audit import build_tick_coverage
    raw = material()
    # What production carries: the tick audit without an authority (coverage_ratio 0.0), and
    # a float whose Python and ECMAScript texts differ.
    raw["full_tick_audit"] = build_tick_coverage(batches=[], playback_ticks=6400)
    raw["full_tick_audit"]["probe_small_float"] = 1e-07
    final = finalize_evidence(build_raw_evidence(raw, output()),
                              parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:a"},
                              contract_version=1, demo_sha256="a" * 64, file_size=99)
    published = json.loads(json.dumps(final))["forensic_contract_v2"]
    unsigned = {key: value for key, value in published.items()
                if key not in {"deterministic_digest", "unsigned_contract_digest", "final_contract_digest"}}
    expected = hashlib.sha256(_app_stable(unsigned)).hexdigest()
    assert published["deterministic_digest"] == expected
    assert published["unsigned_contract_digest"] == expected


def test_every_canonical_mapping_names_its_persisted_target():
    # The APP refuses a CANONICAL (v1 MAPPED) row without both an app field and a persisted
    # target (forensic_v2_canonical_mapping_missing). header.demo_version_name had none.
    from raw_evidence import MAPPED_RAW_FIELDS
    for raw_field, (app_field, canonical_field, status) in MAPPED_RAW_FIELDS.items():
        if status == "MAPPED":
            assert app_field and canonical_field, raw_field
    assert MAPPED_RAW_FIELDS["header.demo_version_name"][1] == "matches.game_version"
