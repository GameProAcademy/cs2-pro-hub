"""D22: event times from the demo's own proven game clock.

Production evidence (Mirage job 921b55cf, RAW artifact physical summary): the header has no
playback tickrate; ``player_death`` rows carry no ``game_time``/``total_rounds_played`` (the
event stream fell back to plain rows); the sampled ``ticks`` section carries ``tick`` and
``game_time``. Every persisted event had ``time_seconds`` NULL, so opening duels, trades and
flash assists were NULL for every demo.
"""
from parser import _postprocess_contract, infer_game_clock

A = "76561198000000001"


def clock_rows(ticks, rate=64.0, offset=12.5, players=2):
    return [{"tick": t, "game_time": t / rate + offset, "steamid": f"p{p}"} for t in ticks for p in range(players)]


def output_with(events):
    return {"header": {}, "players": [], "rounds": [], "events": events, "warnings": []}


def test_the_clock_is_proven_from_sampled_ticks():
    rate, offset = infer_game_clock(clock_rows([640, 1280, 64000, 128000]))
    assert rate == 64.0 and abs(offset - 12.5) < 1e-9


def test_never_assumed_without_enough_or_consistent_evidence():
    assert infer_game_clock([]) is None
    assert infer_game_clock(clock_rows([640])) is None  # one distinct tick
    paused = clock_rows([640, 1280]) + [{"tick": 1920, "game_time": 1280 / 64 + 12.5}]
    assert infer_game_clock(paused) is None  # clock stopped while ticks advanced
    conflicting = clock_rows([640, 1280]) + [{"tick": 640, "game_time": 99.0}]
    assert infer_game_clock(conflicting) is None
    bent = clock_rows([640, 1280]) + [{"tick": 6400, "game_time": 6400 / 32 + 12.5}]
    assert infer_game_clock(bent) is None  # two different rates
    assert infer_game_clock([{"tick": True, "game_time": 1.0}, {"tick": 2, "game_time": None}]) is None


def test_production_shape_events_get_their_game_time():
    raw = {
        "header": {},
        "player_death": [{"tick": 6400, "attacker_steamid": A}],  # no game_time, no round context
        "tick_rows": clock_rows([640, 6400, 12800]),
    }
    result = _postprocess_contract(raw, output_with([
        {"type": "player_death", "round": 3, "tick": 6400, "attacker": A},
        {"type": "player_hurt", "round": 3, "tick": 7040},
    ]))
    times = [event["time_seconds"] for event in result["events"]]
    assert times == [6400 / 64 + 12.5, 7040 / 64 + 12.5]
    assert result["header"].get("tickrate") is None  # inferred clock is not a DECLARED tickrate
    assert any(str(w).startswith("event_times_from_game_clock") for w in result["warnings"])


def test_native_game_time_wins_and_is_matched_by_tick_not_by_round_context():
    raw = {
        "header": {},
        # total_rounds_played counts COMPLETED rounds: 2 during contract round 3.
        "player_death": [{"tick": 6400, "total_rounds_played": 2, "round": 2, "game_time": 111.0}],
        "tick_rows": clock_rows([640, 6400]),
    }
    result = _postprocess_contract(raw, output_with([{"type": "player_death", "round": 3, "tick": 6400}]))
    assert result["events"][0]["time_seconds"] == 111.0


def test_conflicting_native_times_at_one_tick_fall_back_to_the_clock():
    raw = {
        "header": {},
        "player_death": [{"tick": 6400, "game_time": 1.0}, {"tick": 6400, "game_time": 2.0}],
        "tick_rows": clock_rows([640, 6400]),
    }
    result = _postprocess_contract(raw, output_with([{"type": "player_death", "round": 1, "tick": 6400}]))
    assert result["events"][0]["time_seconds"] == 6400 / 64 + 12.5


def test_a_declared_header_tickrate_still_wins_over_the_clock():
    raw = {"header": {"playback_ticks_per_second": 64}, "tick_rows": clock_rows([640, 6400], offset=99.0)}
    result = _postprocess_contract(raw, output_with([{"type": "player_death", "round": 1, "tick": 640}]))
    assert result["events"][0]["time_seconds"] == 10.0
    assert not any(str(w).startswith("event_times_from_game_clock") for w in result["warnings"])


def test_without_any_timing_evidence_times_stay_unknown():
    result = _postprocess_contract({"header": {}}, output_with([{"type": "player_death", "round": 1, "tick": 640}]))
    assert "time_seconds" not in result["events"][0]
