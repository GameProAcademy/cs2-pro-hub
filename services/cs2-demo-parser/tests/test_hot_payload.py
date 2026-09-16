import pytest

from hot_payload import HOT_LIMITS, build_hot_payload


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
        assert hot["quality"]["sections"][name]["status"] == "not_implemented"


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