"""End-to-end contract test: demoparser2 raw material -> /v1/parse payload.

This test does NOT check individual adapter functions; it validates the FULL
object the APP receives against `RawParserOutput` (src/lib/pipeline/types.ts).
It fails if the worker ever regresses to `steamid`, to `{type, data}` events, to
round=0, to invented values, or to a wrong parser identity / contract version.
"""

import hashlib

import pytest

from adapter import build_raw_parser_output

A = "76561198000000001"
B = "76561198000000002"

RAW_MATERIAL = {
    "header": {"map_name": "de_mirage", "demo_version_name": "valve_demo_2"},
    "players": [
        {"steamid": A, "name": "alpha", "team_number": 3},
        {"steamid": B, "name": "bravo", "team_number": 2},
        {"steamid": "BOT", "name": "Bot Dave"},
    ],
    "round_starts": [{"tick": 100}, {"tick": 500}],
    "round_ends": [{"tick": 400, "winner": "CT"}, {"tick": 900, "winner": "TERRORIST"}],
    "player_death": [
        {
            "tick": 250,
            "attacker_steamid": A,
            "user_steamid": B,
            "assister_steamid": None,
            "weapon": "ak47",
            "headshot": True,
            "penetrated": 0,
        }
    ],
    "player_hurt": [{"tick": 240, "attacker_steamid": A, "user_steamid": B, "dmg_health": 27}],
    "player_blind": [{"tick": 230, "attacker_steamid": A, "user_steamid": B, "blind_duration": 1.9}],
    "bomb_planted": [{"tick": 700, "user_steamid": B}],
    "bomb_defused": [],
    "bomb_exploded": None,
    "warnings": [],
}

STRING_FIELDS = {"type", "attacker", "victim", "assister", "weapon", "grenade_type"}
NUMBER_FIELDS = {
    "round",
    "tick",
    "time_seconds",
    "penetration",
    "distance",
    "damage",
    "armor_damage",
    "flash_duration",
    "players_flashed",
    "cost",
}
BOOL_FIELDS = {"headshot", "wallbang", "noscope", "blind"}
POSITION_FIELDS = {"position", "victim_position"}
ALLOWED_EVENT_FIELDS = STRING_FIELDS | NUMBER_FIELDS | BOOL_FIELDS | POSITION_FIELDS
ALLOWED_ROUND_FIELDS = {
    "number",
    "winner_team",
    "winner_side",
    "start_tick",
    "end_tick",
    "duration_seconds",
    "bomb_planted",
    "bomb_defused",
    "bomb_exploded",
    "money_start",
    "money_end",
    "equipment_value",
    "sides",
}


@pytest.fixture()
def payload():
    from settings import DEFAULT_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION

    output = build_raw_parser_output(dict(RAW_MATERIAL))
    return {
        "parser": {"name": PARSER_NAME, "version": PARSER_VERSION, "revision": "git:" + "a" * 40},
        "contract_version": DEFAULT_CONTRACT_VERSION,
        **output,
    }


def test_parser_identity_and_contract_version(payload):
    assert payload["parser"]["name"] == "demoparser2"
    assert payload["parser"]["version"] == "0.42.0"
    assert payload["contract_version"] == 1


def test_players_use_steam_id_only(payload):
    assert payload["players"], "valid players must survive"
    for player in payload["players"]:
        assert set(player).issubset({"steam_id", "name", "team", "side"})
        assert isinstance(player["steam_id"], str) and player["steam_id"].isdigit()
        assert "steamid" not in player


def test_rounds_have_valid_positive_number(payload):
    numbers = [r["number"] for r in payload["rounds"]]
    assert numbers == sorted(numbers)
    for entry in payload["rounds"]:
        assert isinstance(entry["number"], int) and entry["number"] > 0
        assert set(entry).issubset(ALLOWED_ROUND_FIELDS)


def test_events_are_flat_typed_and_round_bound(payload):
    assert payload["events"], "events must not be empty for readable material"
    for event in payload["events"]:
        assert "data" not in event
        assert set(event).issubset(ALLOWED_EVENT_FIELDS), set(event) - ALLOWED_EVENT_FIELDS
        assert isinstance(event["type"], str) and event["type"]
        assert isinstance(event["round"], int) and event["round"] > 0
        for key, value in event.items():
            if key in STRING_FIELDS:
                assert isinstance(value, str)
            elif key in NUMBER_FIELDS:
                assert isinstance(value, (int, float)) and not isinstance(value, bool)
            elif key in BOOL_FIELDS:
                assert isinstance(value, bool)
            else:
                assert isinstance(value, dict) and set(value).issubset({"x", "y", "z"})


def test_header_never_invents_values(payload):
    header = payload["header"]
    assert header["map"] == "de_mirage"
    assert header["tickrate"] is None
    assert header["duration_seconds"] is None
    assert header["match_date"] is None
    assert header["score"] == {} and header["teams"] == {}


def test_unknown_streams_stay_absent(payload):
    for entry in payload["rounds"]:
        assert "bomb_exploded" not in entry  # stream was unreadable
        assert "money_start" not in entry  # economy not provided
    assert any("economy_unavailable" in warning for warning in payload["warnings"])


def test_payload_is_deterministic(payload):
    import json

    def digest(value):
        return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

    again = build_raw_parser_output(dict(RAW_MATERIAL))
    assert digest({k: v for k, v in payload.items() if k in again}) == digest(again)
