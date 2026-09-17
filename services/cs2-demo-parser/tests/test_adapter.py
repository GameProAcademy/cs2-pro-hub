"""Unit tests for the demoparser2 -> RawParserOutput adapter.

Everything asserted here is about the contract in `src/lib/pipeline/types.ts`:
flat events, real rounds, `steam_id`, and NULL semantics (unknown is never 0 and
never False).
"""

import json

import pytest

from adapter import (
    build_raw_parser_output,
    build_round_intervals,
    normalize_events,
    normalize_header,
    normalize_players,
    normalize_rounds,
    resolve_event_round,
)

A = "76561198000000001"
B = "76561198000000002"


# --------------------------------------------------------------------------- #
# A. players
# --------------------------------------------------------------------------- #
def test_players_map_steamid_and_team_number():
    warnings: list[str] = []
    players = normalize_players(
        [
            {"name": "alpha", "steamid": A, "team_number": 3},
            {"name": "bravo", "steamid": B, "team_number": 2},
        ],
        warnings,
    )
    assert players == [
        {"steam_id": A, "name": "alpha", "team": "CT"},
        {"steam_id": B, "name": "bravo", "team": "TERRORIST"},
    ]
    # side is never invented from team_number
    assert all("side" not in player for player in players)


def test_players_drop_invalid_steam_ids_and_warn():
    warnings: list[str] = []
    players = normalize_players(
        [{"name": "bot", "steamid": "BOT"}, {"name": "x", "steamid": 0}], warnings
    )
    assert players == []
    assert any("no valid steam id" in warning for warning in warnings)


def test_players_deduplicate_and_keep_missing_fields_absent():
    warnings: list[str] = []
    players = normalize_players(
        [{"steamid": A}, {"steamid": A, "name": "alpha", "team_number": 0}], warnings
    )
    assert players == [{"steam_id": A, "name": "alpha"}]


def test_players_are_sorted_by_steam_id():
    warnings: list[str] = []
    players = normalize_players([{"steamid": B}, {"steamid": A}], warnings)
    assert [p["steam_id"] for p in players] == [A, B]


# --------------------------------------------------------------------------- #
# B. header
# --------------------------------------------------------------------------- #
def test_header_maps_real_fields_only():
    warnings: list[str] = []
    header = normalize_header({"map_name": "de_mirage", "demo_version_name": "valve_demo_2"}, warnings)
    assert header["map"] == "de_mirage"
    assert header["game_version"] == "valve_demo_2"
    assert header["tickrate"] is None
    assert header["duration_seconds"] is None
    assert header["match_date"] is None
    assert header["score"] == {}
    assert header["teams"] == {}
    assert any("tickrate_unavailable" in warning for warning in warnings)


def test_header_missing_map_warns():
    warnings: list[str] = []
    header = normalize_header({}, warnings)
    assert header["map"] is None
    assert "map_unavailable" in warnings


# --------------------------------------------------------------------------- #
# C. rounds
# --------------------------------------------------------------------------- #
def _rounds(**kwargs):
    warnings: list[str] = kwargs.pop("warnings", [])
    return normalize_rounds(warnings=warnings, **kwargs)


def test_rounds_pair_start_and_end_ticks():
    rounds = _rounds(
        round_starts=[{"tick": 100}, {"tick": 500}],
        round_ends=[{"tick": 400}, {"tick": 900}],
        bombs={"planted": [], "defused": [], "exploded": []},
        tickrate=None,
    )
    assert [r["number"] for r in rounds] == [1, 2]
    assert rounds[0]["start_tick"] == 100 and rounds[0]["end_tick"] == 400
    assert rounds[1]["start_tick"] == 500 and rounds[1]["end_tick"] == 900
    assert all("duration_seconds" not in r for r in rounds)


def test_rounds_out_of_order_input_is_ordered():
    rounds = _rounds(
        round_starts=[{"tick": 500}, {"tick": 100}],
        round_ends=[{"tick": 900}, {"tick": 400}],
        bombs={"planted": None, "defused": None, "exploded": None},
        tickrate=None,
    )
    assert [r["end_tick"] for r in rounds] == [400, 900]


def test_round_duration_only_with_real_tickrate():
    rounds = _rounds(
        round_starts=[{"tick": 0}],
        round_ends=[{"tick": 128}],
        bombs={"planted": [], "defused": [], "exploded": []},
        tickrate=64.0,
    )
    assert rounds[0]["duration_seconds"] == 2.0


def test_round_winner_side_from_real_evidence_only():
    rounds = _rounds(
        round_starts=[{"tick": 1}],
        round_ends=[{"tick": 10, "winner": "CT"}],
        bombs={"planted": [], "defused": [], "exploded": []},
        tickrate=None,
    )
    assert rounds[0]["winner_side"] == "CT"
    assert "winner_team" not in rounds[0]


def test_round_bomb_flags_null_when_stream_unreadable_false_when_absent():
    rounds = _rounds(
        round_starts=[{"tick": 1}],
        round_ends=[{"tick": 100}],
        bombs={"planted": [{"tick": 50}], "defused": [], "exploded": None},
        tickrate=None,
    )
    assert rounds[0]["bomb_planted"] is True
    assert rounds[0]["bomb_defused"] is False
    # unreadable stream stays ABSENT, it is never turned into False
    assert "bomb_exploded" not in rounds[0]


def test_rounds_without_evidence_is_empty():
    assert (
        _rounds(
            round_starts=[],
            round_ends=[],
            bombs={"planted": None, "defused": None, "exploded": None},
            tickrate=None,
        )
        == []
    )


def test_round_numbers_are_positive_integers():
    rounds = _rounds(
        round_starts=[{"tick": None}, {"tick": 5}],
        round_ends=[{"tick": 50}],
        bombs={"planted": [], "defused": [], "exploded": []},
        tickrate=None,
    )
    assert all(isinstance(r["number"], int) and r["number"] > 0 for r in rounds)


# --------------------------------------------------------------------------- #
# D + E. events and round resolution
# --------------------------------------------------------------------------- #
INTERVALS = [(1, 100, 400), (2, 500, 900)]


@pytest.mark.parametrize(
    "tick,expected",
    [
        (100, 1),  # first tick of round 1
        (250, 1),  # inside round 1
        (400, 1),  # last tick of round 1
        (450, 2),  # between rounds -> next round to end
        (900, 2),
        (50, None),  # before any round
        (1200, None),  # after the last known end
        (None, None),  # no tick
    ],
)
def test_resolve_event_round(tick, expected):
    assert resolve_event_round(tick, INTERVALS) == expected


def test_resolve_event_round_with_observed_starts_and_unknown_ends():
    starts_only = [(1, 100, None), (2, 500, None), (3, 900, None)]
    assert resolve_event_round(99, starts_only) is None
    assert resolve_event_round(100, starts_only) == 1
    assert resolve_event_round(499, starts_only) == 1
    assert resolve_event_round(500, starts_only) == 2
    assert resolve_event_round(899, starts_only) == 2
    assert resolve_event_round(900, starts_only) == 3
    assert resolve_event_round(1200, starts_only) == 3


def test_events_are_flat_and_carry_round():
    warnings: list[str] = []
    events = normalize_events(
        [
            (
                "player_death",
                [
                    {
                        "tick": 250,
                        "attacker_steamid": A,
                        "user_steamid": B,
                        "assister_steamid": None,
                        "weapon": "ak47",
                        "headshot": True,
                        "penetrated": 1,
                        "distance": 12.5,
                    }
                ],
            )
        ],
        INTERVALS,
        warnings,
    )
    assert events == [
        {
            "type": "player_death",
            "round": 1,
            "tick": 250,
            "attacker": A,
            "victim": B,
            "weapon": "ak47",
            "headshot": True,
            "penetration": 1,
            "wallbang": True,
            "distance": 12.5,
        }
    ]
    assert "data" not in events[0]


def test_event_without_resolvable_round_is_dropped_with_warning():
    warnings: list[str] = []
    events = normalize_events([("player_death", [{"tick": 5}])], INTERVALS, warnings)
    assert events == []
    assert any("deterministic round" in warning for warning in warnings)


def test_blind_hurt_and_bomb_event_fields():
    warnings: list[str] = []
    events = normalize_events(
        [
            ("player_blind", [{"tick": 200, "attacker_steamid": A, "user_steamid": B, "blind_duration": 2.5}]),
            ("player_hurt", [{"tick": 210, "attacker_steamid": A, "user_steamid": B, "dmg_health": 34, "dmg_armor": 5}]),
            ("bomb_planted", [{"tick": 300, "user_steamid": A}]),
        ],
        INTERVALS,
        warnings,
    )
    blind, hurt, bomb = events
    assert blind["flash_duration"] == 2.5 and blind["victim"] == B
    assert hurt["damage"] == 34 and hurt["armor_damage"] == 5
    assert bomb["type"] == "bomb_planted" and bomb["attacker"] == A


def test_events_are_sorted_by_round_then_tick_then_type():
    warnings: list[str] = []
    events = normalize_events(
        [
            ("round_end", [{"tick": 900}, {"tick": 400}]),
            ("player_death", [{"tick": 250}]),
        ],
        INTERVALS,
        warnings,
    )
    assert [(e["round"], e["tick"], e["type"]) for e in events] == [
        (1, 250, "player_death"),
        (1, 400, "round_end"),
        (2, 900, "round_end"),
    ]


# --------------------------------------------------------------------------- #
# F. positions
# --------------------------------------------------------------------------- #
def test_position_full_partial_and_absent():
    warnings: list[str] = []
    events = normalize_events(
        [
            (
                "player_death",
                [
                    {"tick": 200, "attacker_X": 1.0, "attacker_Y": 2.0, "attacker_Z": 3.0, "user_X": 9.0},
                    {"tick": 210},
                ],
            )
        ],
        INTERVALS,
        warnings,
    )
    assert events[0]["position"] == {"x": 1.0, "y": 2.0, "z": 3.0}
    assert events[0]["victim_position"] == {"x": 9.0}  # partial stays partial
    assert "position" not in events[1] and "victim_position" not in events[1]


# --------------------------------------------------------------------------- #
# G. NULL semantics
# --------------------------------------------------------------------------- #
def test_unknown_is_never_zero_or_false():
    warnings: list[str] = []
    events = normalize_events(
        [("player_death", [{"tick": 200, "headshot": None, "penetrated": None, "distance": float("nan")}])],
        INTERVALS,
        warnings,
    )
    event = events[0]
    for field in ("headshot", "penetration", "wallbang", "distance", "damage", "weapon"):
        assert field not in event


# --------------------------------------------------------------------------- #
# H. determinism
# --------------------------------------------------------------------------- #
RAW = {
    "header": {"map_name": "de_mirage", "demo_version_name": "valve_demo_2"},
    "players": [{"steamid": B, "name": "bravo", "team_number": 2}, {"steamid": A, "name": "alpha", "team_number": 3}],
    "round_starts": [{"tick": 100}, {"tick": 500}],
    "round_ends": [{"tick": 400, "winner": "CT"}, {"tick": 900, "winner": "TERRORIST"}],
    "player_death": [{"tick": 250, "attacker_steamid": A, "user_steamid": B, "weapon": "ak47", "headshot": False}],
    "player_hurt": [],
    "player_blind": [],
    "bomb_planted": [{"tick": 700, "user_steamid": B}],
    "bomb_defused": [],
    "bomb_exploded": [],
    "warnings": [],
}


def test_build_output_is_byte_for_byte_deterministic():
    first = json.dumps(build_raw_parser_output(json.loads(json.dumps(RAW))), sort_keys=True)
    second = json.dumps(build_raw_parser_output(json.loads(json.dumps(RAW))), sort_keys=True)
    assert first == second


def test_build_round_intervals_is_stable():
    assert build_round_intervals(RAW["round_starts"], RAW["round_ends"]) == [
        (1, 100, 400),
        (2, 500, 900),
    ]
