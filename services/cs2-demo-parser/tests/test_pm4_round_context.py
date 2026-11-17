"""PM4 (R5.8.31) — round-level facts for economy (module E) and round state (module F).

* money_spent: cash_spent_this_round read at the round end tick (the round's purchase);
* disconnected: humans whose player_disconnect fired inside the round window (BOTs excluded).

Both are carried on the round's own round_end event, only when the fact exists.
"""
import parser as worker_parser

A = "76561198000000001"
B = "76561198000000002"


def round_end(number, tick):
    return {"type": "round_end", "round": number, "tick": tick}


def run(rounds, events, disconnects=None):
    raw = {"event_tables": {"player_disconnect": disconnects or []}}
    output = {"rounds": rounds, "events": events}
    worker_parser.attach_round_end_context(raw, output)
    return output["events"]


def test_money_spent_goes_on_the_round_end_event_of_the_same_round_and_tick():
    events = run(
        [{"number": 1, "start_tick": 100, "end_tick": 900, "money_spent": {A: 650, B: 0}}],
        [round_end(1, 900)],
    )
    assert events[0]["money_spent"] == {A: 650, B: 0}  # zero is kept as zero (spent nothing)


def test_round_end_on_another_tick_or_round_gets_nothing():
    rounds = [{"number": 1, "start_tick": 100, "end_tick": 900, "money_spent": {A: 650}}]
    events = run(rounds, [round_end(1, 899), round_end(2, 900)])
    assert all("money_spent" not in e for e in events)


def test_no_spend_read_means_no_key_never_an_empty_or_zero_guess():
    events = run([{"number": 1, "start_tick": 100, "end_tick": 900}], [round_end(1, 900)])
    assert "money_spent" not in events[0] and "disconnected" not in events[0]


def test_human_disconnect_inside_the_window_is_listed_bots_and_outside_ticks_are_not():
    disconnects = [
        {"tick": 500, "user_steamid": A, "networkid": "STEAM_1:0:1"},
        {"tick": 600, "user_steamid": None, "networkid": "BOT", "xuid": 0},
        {"tick": 950, "user_steamid": B, "networkid": "STEAM_1:0:2"},
        {"tick": 100, "user_steamid": int(B), "networkid": "STEAM_1:0:2"},
    ]
    events = run(
        [
            {"number": 1, "start_tick": 100, "end_tick": 900},
            {"number": 2, "start_tick": 1000, "end_tick": 1900},
        ],
        [round_end(1, 900), round_end(2, 1900)],
        disconnects,
    )
    assert events[0]["disconnected"] == {A: 500, B: 100}
    assert "disconnected" not in events[1]


def test_economy_end_read_now_includes_cash_spent_this_round():
    assert "cash_spent_this_round" in worker_parser.ECONOMY_END_PROPS
