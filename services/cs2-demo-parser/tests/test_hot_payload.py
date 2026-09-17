import pytest

from hot_payload import HOT_LIMITS, build_hot_payload, hot_payload_measurements


def test_hot_payload_is_bounded_and_marks_overflow():
    events = [{"type": "player_death", "tick": index} for index in range(HOT_LIMITS["combat_events"] + 7)]
    hot = build_hot_payload(
        {"header": {"map": "de_cache"}, "players": [], "rounds": [], "events": events, "warnings": []},
        parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:" + "a" * 40},
        contract_version=1, demo_sha256="b" * 64, upload_id="upload",
    )
    assert len(hot["combat_events"]) == HOT_LIMITS["combat_events"]
    quality = hot["quality"]["sections"]["combat_events"]
    assert quality == {"status": "limited", "observed_rows": HOT_LIMITS["combat_events"] + 7,
                       "included_rows": HOT_LIMITS["combat_events"], "limit": HOT_LIMITS["combat_events"],
                       "overflow_rows": 7}
    assert hot["quality"]["partial"] is True
    assert "raw_evidence" not in hot and "grenade_samples" not in hot


def test_hot_payload_marks_unclassified_events_partial():
    hot = build_hot_payload(
        {"header": {}, "players": [], "rounds": [], "events": [{"type": "unknown_event"}]},
        parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:test"},
        contract_version=1, demo_sha256="a" * 64, upload_id="upload",
    )
    assert hot["quality"]["partial"] is True
    assert hot["quality"]["unclassified_event_rows"] == 1
    assert hot["combat_events"] == []
    for name in ("aim_observations", "position_snapshots", "economy_snapshots"):
        assert hot[name] == []
        assert hot["quality"]["sections"][name]["status"] == "unavailable"


def test_limited_sections_and_partial_are_exactly_derived():
    hot = build_hot_payload(
        {"players": [{}] * (HOT_LIMITS["players"] + 1), "rounds": [], "events": []},
        parser={"name": "demoparser2"}, contract_version=1,
        demo_sha256="a" * 64, upload_id="upload",
    )
    assert hot["quality"]["limited_sections"] == ["players"]
    assert hot["quality"]["partial"] is True
    for name, quality in hot["quality"]["sections"].items():
        assert quality["included_rows"] == len(hot[name])
        assert quality["observed_rows"] - quality["included_rows"] == quality["overflow_rows"]


@pytest.mark.parametrize("name", list(HOT_LIMITS))
def test_hot_bounds_exact_limit_and_limit_plus_one(name):
    if name in {"aim_observations", "position_snapshots", "economy_snapshots"}:
        return
    if name == "warnings":
        exact_input = {"warnings": ["warning"] * HOT_LIMITS[name]}
        overflow_input = {"warnings": ["warning"] * (HOT_LIMITS[name] + 1)}
    elif name in {"players", "rounds"}:
        exact_input = {name: [{}] * HOT_LIMITS[name]}
        overflow_input = {name: [{}] * (HOT_LIMITS[name] + 1)}
    else:
        event_type = {"combat_events": "player_death", "utility_events": "player_blind",
                      "objective_events": "round_end"}[name]
        exact_input = {"events": [{"type": event_type}] * HOT_LIMITS[name]}
        overflow_input = {"events": [{"type": event_type}] * (HOT_LIMITS[name] + 1)}
    base = dict(parser={"name": "demoparser2"}, contract_version=1,
                demo_sha256="a" * 64, upload_id="upload")
    exact = build_hot_payload(exact_input, **base)
    overflow = build_hot_payload(overflow_input, **base)
    assert exact["quality"]["sections"][name]["status"] == "complete"
    assert exact["quality"]["sections"][name]["overflow_rows"] == 0
    assert overflow["quality"]["sections"][name]["status"] == "limited"
    assert overflow["quality"]["sections"][name]["observed_rows"] == HOT_LIMITS[name] + 1
    assert overflow["quality"]["sections"][name]["included_rows"] == HOT_LIMITS[name]
    assert overflow["quality"]["sections"][name]["overflow_rows"] == 1


def test_semantic_tick_evidence_populates_aim_position_and_economy_without_invention():
    source = {
        "player_steamid": 76561198000000001, "tick": 2048, "total_rounds_played": 7,
        "game_time": 31.25, "team_num": 3, "pitch": -4.5, "yaw": 91.25,
        "shots_fired": 2, "is_scoped": False, "active_weapon_name": "ak47",
        "X": 128.5, "Y": -64.0, "Z": 12.25, "velocity_X": 3.5,
        "last_place_name": "BombsiteA", "balance": 1200,
        "current_equip_value": 4550, "weapon_purchases_this_round": ["ak47"],
    }
    hot = build_hot_payload(
        {"header": {}, "players": [], "rounds": [], "events": []},
        parser={"name": "demoparser2"}, contract_version=1,
        demo_sha256="a" * 64, upload_id="upload", evidence={"tick_samples": [source]},
    )
    assert hot["aim_observations"] == [{
        "player": "76561198000000001", "tick": 2048, "round": 7, "time_seconds": 31.25,
        "side": "CT", "pitch": -4.5, "yaw": 91.25, "shots_fired": 2,
        "is_scoped": False, "active_weapon_name": "ak47",
    }]
    assert hot["position_snapshots"] == [{
        "player": "76561198000000001", "tick": 2048, "round": 7, "time_seconds": 31.25,
        "side": "CT", "x": 128.5, "y": -64.0, "z": 12.25,
        "velocity_x": 3.5, "last_place_name": "BombsiteA",
    }]
    assert hot["economy_snapshots"] == [{
        "player": "76561198000000001", "tick": 2048, "round": 7, "time_seconds": 31.25,
        "side": "CT", "balance": 1200, "current_equip_value": 4550,
        "weapon_purchases_this_round": ["ak47"],
    }]
    for name in ("aim_observations", "position_snapshots", "economy_snapshots"):
        assert hot["quality"]["sections"][name]["status"] == "complete"


def test_non_finite_semantic_values_are_absent_and_valid_numbers_are_preserved():
    hot = build_hot_payload(
        {"header": {}, "players": [], "rounds": [], "events": []},
        parser={"name": "demoparser2"}, contract_version=1,
        demo_sha256="a" * 64, upload_id="upload",
        evidence={"tick_samples": [{"tick": 1, "yaw": float("nan"), "pitch": 1.25,
                                      "X": float("inf"), "Y": -2.5, "balance": float("-inf"),
                                      "current_equip_value": 3000}]},
    )
    assert hot["aim_observations"] == [{"tick": 1, "pitch": 1.25}]
    assert hot["position_snapshots"] == [{"tick": 1, "y": -2.5}]
    assert hot["economy_snapshots"] == [{"tick": 1, "current_equip_value": 3000}]


def test_semantic_sections_are_bounded_with_explicit_overflow():
    rows = [{"tick": index, "yaw": float(index), "X": float(index), "balance": index}
            for index in range(HOT_LIMITS["aim_observations"] + 1)]
    hot = build_hot_payload(
        {"header": {}, "players": [], "rounds": [], "events": []},
        parser={"name": "demoparser2"}, contract_version=1,
        demo_sha256="a" * 64, upload_id="upload", evidence={"tick_samples": rows},
    )
    for name in ("aim_observations", "position_snapshots", "economy_snapshots"):
        assert len(hot[name]) == HOT_LIMITS[name]
        assert hot["quality"]["sections"][name]["status"] == "limited"
        assert hot["quality"]["sections"][name]["overflow_rows"] == 1
    assert hot["quality"]["partial"] is True


def test_hot_measurements_report_total_section_bytes_and_rows_without_raw():
    hot = build_hot_payload(
        {"header": {}, "players": [], "rounds": [], "events": [], "warnings": []},
        parser={"name": "demoparser2"}, contract_version=1,
        demo_sha256="a" * 64, upload_id="upload",
        evidence={"tick_samples": [{"tick": 1, "yaw": 10.0, "X": 20.0, "balance": 800}]},
    )
    measurements = hot_payload_measurements(hot)
    assert measurements["hot_payload_bytes"] > 0
    assert measurements["sections"]["aim_observations"]["rows"] == 1
    assert measurements["sections"]["position_snapshots"]["bytes"] > 0
    assert "grenades" not in measurements["sections"]


def test_parser_native_nested_nonfinite_semantic_values_become_null():
    hot = build_hot_payload(
        {"header": {}, "players": [], "rounds": [], "events": []},
        parser={"name": "demoparser2"}, contract_version=1,
        demo_sha256="a" * 64, upload_id="upload",
        evidence={"tick_samples": [{"tick": 1, "aim_punch_angle": [1.0, float("nan")],
                                      "weapon_purchases_this_round": {"ak47": float("inf")}}]},
    )
    assert hot["aim_observations"][0]["aim_punch_angle"] == [1.0, None]
    assert hot["economy_snapshots"][0]["weapon_purchases_this_round"] == {"ak47": None}