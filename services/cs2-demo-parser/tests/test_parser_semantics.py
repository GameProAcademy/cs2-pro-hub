"""Semantic boundary tests for the demoparser2 -> RawParserOutput path."""

from parser import _postprocess_contract, _contextualize_rows

A = "76561198000000001"


def test_warmup_rows_are_not_allowed_into_contract_context():
    rows = _contextualize_rows(
        [
            {"tick": 10, "total_rounds_played": 0, "is_warmup_period": True},
            {"tick": 100, "total_rounds_played": 1, "is_warmup_period": False, "game_time": 12.5},
        ]
    )
    assert len(rows) == 1
    assert rows[0]["round"] == 1
    assert rows[0]["time_seconds"] == 12.5


def test_team_number_is_not_promoted_to_team_identity():
    output = {
        "header": {},
        "players": [
            {"steam_id": A, "name": "alpha", "team": "CT"},
            {"steam_id": "76561198000000002", "name": "bravo", "team": "TERRORIST"},
        ],
        "rounds": [],
        "events": [],
    }
    result = _postprocess_contract({"header": {}}, output)
    assert result["players"] == [
        {"steam_id": A, "name": "alpha", "side": "CT"},
        {"steam_id": "76561198000000002", "name": "bravo", "side": "T"},
    ]


def test_real_header_tickrate_and_duration_are_preserved():
    output = {"header": {}, "players": [], "rounds": [], "events": []}
    result = _postprocess_contract(
        {"header": {"playback_ticks_per_second": 64, "playback_ticks": 6400}},
        output,
    )
    assert result["header"]["tickrate"] == 64.0
    assert result["header"]["duration_seconds"] == 100.0


def test_event_timing_uses_native_game_time_before_tick_derivation():
    output = {
        "header": {},
        "players": [],
        "rounds": [],
        "events": [{"type": "player_death", "round": 1, "tick": 640, "data": {}}],
    }
    raw = {
        "header": {"playback_ticks_per_second": 64},
        "player_death": [
            {"tick": 640, "round": 1, "game_time": 9.75},
        ],
    }
    result = _postprocess_contract(raw, output)
    assert result["events"][0]["time_seconds"] == 9.75


def test_event_timing_falls_back_only_to_verified_tickrate():
    output = {
        "header": {},
        "players": [],
        "rounds": [],
        "events": [{"type": "player_death", "round": 1, "tick": 640, "data": {}}],
    }
    raw = {"header": {"playback_ticks_per_second": 64}}
    result = _postprocess_contract(raw, output)
    assert result["events"][0]["time_seconds"] == 10.0


def test_winner_side_is_not_mislabeled_as_team_identity():
    output = {
        "header": {},
        "players": [],
        "rounds": [{"number": 1, "winner_team": "CT"}],
        "events": [],
    }
    result = _postprocess_contract({"header": {}}, output)
    assert result["rounds"] == [{"number": 1, "winner_side": "CT"}]
