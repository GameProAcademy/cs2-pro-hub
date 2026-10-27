"""D29: per-round sides read directly at each round's start tick.

Production evidence (Dust2 job 83a539c1 / Mirage job 221f7e42): the general tick sample is
capped at TICK_SAMPLE_LIMIT rows thinned across every event tick, so a round's start tick
kept one or two players; per-round sides were missing and trades / KAST / clutches could
not be evaluated (stored as NULL after D27).
"""
from parser import _parse_round_sides, enrich_rounds_from_tick_evidence

A, B, C = "76561198000000001", "76561198000000002", "76561198000000003"


class FakeDemo:
    def __init__(self, rows=None, error=None):
        self.rows, self.error, self.calls = rows or [], error, []

    def parse_ticks(self, props, ticks=None):
        self.calls.append((list(props), list(ticks or [])))
        if self.error:
            raise self.error
        return list(self.rows)


def test_one_bounded_read_of_team_num_at_round_start_ticks_only():
    demo = FakeDemo([
        {"tick": 100, "steamid": A, "team_num": 3}, {"tick": 100, "steamid": B, "team_num": 2},
        {"tick": 900, "steamid": A, "team_num": 2}, {"tick": 900, "steamid": B, "team_num": 3},
        {"tick": 555, "steamid": C, "team_num": 2},  # not a requested tick: ignored
    ])
    sides, error = _parse_round_sides(demo, [900, 100, None, 100])
    assert error is None
    assert demo.calls == [(["team_num"], [100, 900])]
    assert sides == {100: {A: "CT", B: "T"}, 900: {A: "T", B: "CT"}}


def test_spectators_unknown_ids_and_conflicts_are_never_guessed():
    demo = FakeDemo([
        {"tick": 100, "steamid": A, "team_num": 1},  # spectator
        {"tick": 100, "steamid": None, "team_num": 2},
        {"tick": 100, "steamid": B, "team_num": 2}, {"tick": 100, "steamid": B, "team_num": 3},
        {"tick": 100, "steamid": C, "team_num": 3},
    ])
    sides, _ = _parse_round_sides(demo, [100])
    assert sides == {100: {C: "CT"}}


def test_failures_are_evidence_not_sides():
    sides, error = _parse_round_sides(FakeDemo(error=RuntimeError("bad")), [100])
    assert sides == {} and isinstance(error, RuntimeError)
    sides, error = _parse_round_sides(FakeDemo(), [])
    assert sides == {} and error is not None
    sides, error = _parse_round_sides(object(), [100])
    assert sides == {} and isinstance(error, AttributeError)


def test_enrichment_prefers_the_round_start_read_and_drops_disagreements():
    raw = {
        "tick_rows": [{"tick": 100, "steamid": A, "team_num": 2}, {"tick": 100, "steamid": C, "team_num": 3}],
        "round_sides": {100: {A: "CT", B: "T"}},
    }
    output = {"rounds": [{"number": 1, "start_tick": 100, "end_tick": 400}]}
    enrich_rounds_from_tick_evidence(raw, output)
    # B from the dedicated read, C only from the sample, A dropped (T in the sample, CT read).
    assert output["rounds"][0]["sides"] == {B: "T", C: "CT"}
    assert raw["round_side_conflicts"] == [(100, A)]


def test_without_the_dedicated_read_the_sample_is_unchanged():
    raw = {"tick_rows": [{"tick": 100, "steamid": A, "team_num": 2}]}
    output = {"rounds": [{"number": 1, "start_tick": 100, "end_tick": 400}]}
    enrich_rounds_from_tick_evidence(raw, output)
    assert output["rounds"][0]["sides"] == {A: "T"}
