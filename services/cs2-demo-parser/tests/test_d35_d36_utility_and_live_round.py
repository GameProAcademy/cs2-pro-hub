"""D35 (grenade thrower, game flash-assist flag) and D36 (live-round instant).

Real-demo facts these tests encode (demoparser2, FURIA vs GamerLegion Dust2/Mirage):
`flashbang_detonate` / `hegrenade_detonate` / `smokegrenade_detonate` / `inferno_startburn`
rows carry the thrower as `user_steamid`; `player_death` carries `assistedflash`;
`round_freeze_end` exists once per live round. Nothing is inferred when absent.
"""
from adapter import build_raw_parser_output, normalize_events, normalize_rounds
from parser import _postprocess_contract

A = "76561198000000001"
B = "76561198000000002"
INTERVALS = [(1, 100, 500), (2, 600, 900)]


def test_grenade_detonations_carry_the_thrower_and_nothing_else_is_inferred():
    warnings: list[str] = []
    events = normalize_events(
        [
            ("flashbang_detonate", [{"tick": 150, "user_steamid": A, "entityid": 7}]),
            ("hegrenade_detonate", [{"tick": 160, "user_steamid": B}]),
            ("smokegrenade_detonate", [{"tick": 170}]),  # no thrower in the row
            ("inferno_startburn", [{"tick": 180, "user_steamid": A}]),
            ("smokegrenade_expired", [{"tick": 190, "user_steamid": A}]),
        ],
        INTERVALS,
        warnings,
    )
    by_type = {e["type"]: e for e in events}
    assert by_type["flashbang_detonate"]["attacker"] == A
    assert by_type["hegrenade_detonate"]["attacker"] == B
    assert by_type["inferno_startburn"]["attacker"] == A
    assert "attacker" not in by_type["smokegrenade_detonate"]
    assert "attacker" not in by_type["smokegrenade_expired"]  # expiry is not usage evidence
    assert all("victim" not in e for e in events)  # a detonation never names who was hit


def test_invalid_thrower_id_is_dropped_not_guessed():
    events = normalize_events([("flashbang_detonate", [{"tick": 150, "user_steamid": "0"}])], INTERVALS, [])
    assert "attacker" not in events[0]


def test_player_death_keeps_the_game_flash_assist_flag():
    events = normalize_events(
        [("player_death", [
            {"tick": 200, "attacker_steamid": A, "user_steamid": B, "assister_steamid": A, "assistedflash": True},
            {"tick": 210, "attacker_steamid": B, "user_steamid": A, "assistedflash": False},
            {"tick": 220, "attacker_steamid": B, "user_steamid": A},
        ])],
        INTERVALS,
        [],
    )
    assert [e.get("assisted_flash") for e in events] == [True, False, None]


def test_freeze_end_is_taken_only_inside_the_round_window_last_one_wins():
    rounds = normalize_rounds(
        [{"tick": 100}, {"tick": 600}],
        [{"tick": 500}, {"tick": 900}],
        bombs={},
        tickrate=None,
        warnings=[],
        freeze_ends=[{"tick": 50}, {"tick": 120}, {"tick": 140}, {"tick": 550}],
    )
    assert rounds[0]["freeze_end_tick"] == 140  # restart inside freeze time: last one
    assert "freeze_end_tick" not in rounds[1]  # 550 lies between rounds: never borrowed


def test_freeze_end_time_uses_the_event_clock():
    raw = {
        "header": {},
        "players": [],
        "round_starts": [{"tick": 100}],
        "round_ends": [{"tick": 500}],
        "round_freeze_ends": [{"tick": 140, "time_seconds": 612.5}],
        "player_death": [{"tick": 200, "attacker_steamid": A, "user_steamid": B, "time_seconds": 620.0}],
    }
    output = _postprocess_contract(raw, build_raw_parser_output(raw))
    assert output["rounds"][0]["freeze_end_tick"] == 140
    assert output["rounds"][0]["freeze_end_time_seconds"] == 612.5
    death = next(e for e in output["events"] if e["type"] == "player_death")
    assert death["time_seconds"] - output["rounds"][0]["freeze_end_time_seconds"] == 7.5


def test_no_freeze_end_stream_means_no_reference():
    raw = {"header": {}, "players": [], "round_starts": [{"tick": 100}], "round_ends": [{"tick": 500}]}
    output = _postprocess_contract(raw, build_raw_parser_output(raw))
    assert "freeze_end_tick" not in output["rounds"][0]
    assert "freeze_end_time_seconds" not in output["rounds"][0]
