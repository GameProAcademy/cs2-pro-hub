"""D13 (2026-10-20): observed round boundaries for demos without round_start/round_end.

Production evidence: the authorized m2-mirage DEM (job 9572a234) and the m1-cache DEM
(job 2dc1ddd1) advertise neither event, so every round had an unknown end tick and
winner and admission v3 blocked RAW-V2-12. Boundaries are now OBSERVED from game-rules
state: freeze-time entry (round_start tick), total_rounds_played +1 (round_end tick),
and a winner only when round_win_status and the score delta agree.
"""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import pytest

import parser as P
from parser import _parse_round_state_transitions, derive_round_streams_from_tick_evidence


def _rows(tick, *, freeze=False, warmup=False, played=0, status=0, reason=0, t_score=0, ct_score=0):
    base = {"tick": tick, "is_freeze_period": freeze, "is_warmup_period": warmup,
            "total_rounds_played": played, "round_win_status": status, "round_win_reason": reason}
    return [
        {**base, "team_num": 2, "team_rounds_total": t_score, "steamid": 1},
        {**base, "team_num": 3, "team_rounds_total": ct_score, "steamid": 2},
    ]


class FakeDemo:
    def __init__(self, rows):
        self.frame = pd.DataFrame(rows)
        self.calls = []

    def parse_ticks(self, props, players=None, ticks=None):
        self.calls.append((tuple(props), tuple(players) if players else None, ticks))
        frame = self.frame
        if players is not None:
            frame = frame[frame["steamid"].isin(players)]
        return frame.reset_index(drop=True)


PLAYERS = [{"steamid": 1, "team_number": 2}, {"steamid": 2, "team_number": 3}]


def _match():
    """Warmup, two rounds, a restart blip, and a score/status disagreement."""
    rows = []
    rows += _rows(1, warmup=True)
    rows += _rows(10, freeze=True)                                        # round 1 start (freeze entry)
    rows += _rows(20)                                                     # freeze end
    rows += _rows(30, played=1, status=2, reason=9, t_score=1)            # round 1 end, T wins (agree)
    rows += _rows(40, played=1, freeze=True, t_score=1)                   # round 2 start
    rows += _rows(50, played=1, t_score=1)
    rows += _rows(60, played=2, status=3, reason=7, t_score=2, ct_score=0)  # end: status CT, score T -> disagree
    rows += _rows(70, played=0, freeze=True)                              # restart: decrement, new freeze entry
    return rows


def test_boundaries_are_observed_from_game_state_transitions():
    out, error = _parse_round_state_transitions(FakeDemo(_match()), PLAYERS)
    assert error is None
    assert [row["tick"] for row in out["round_starts"]] == [10, 40, 70]
    assert all(row["derived_from"] == "game_state.is_freeze_period" for row in out["round_starts"])
    assert out["round_ends"] == [
        {"tick": 30, "derived_from": "game_state.total_rounds_played", "reason": 9, "winner": 2},
        # round_win_status and the score delta disagree: the winner stays unknown.
        {"tick": 60, "derived_from": "game_state.total_rounds_played", "reason": 7},
    ]


def test_warmup_never_produces_a_boundary():
    rows = _rows(1, warmup=True) + _rows(2, warmup=True, freeze=True) + _rows(3, warmup=True, played=1)
    out, error = _parse_round_state_transitions(FakeDemo(rows), PLAYERS)
    assert error is None
    assert out == {"round_starts": [], "round_ends": []}


def test_one_pass_over_a_few_observed_players_per_side():
    rows = _match()
    # Extra players: two more per side and one spectator-like row without a side.
    for row in list(rows):
        rows.append({**row, "steamid": row["steamid"] + 10})
        rows.append({**row, "steamid": row["steamid"] + 20})
    players = [{"steamid": n, "team_number": 2} for n in (1, 11, 21)] + \
              [{"steamid": n, "team_number": 3} for n in (2, 12, 22)] + [{"steamid": 99, "team_number": 1}]
    demo = FakeDemo(rows)
    out, error = _parse_round_state_transitions(demo, players)
    assert error is None
    assert len(demo.calls) == 1
    assert demo.calls[0][1] == (1, 11, 2, 12)
    assert demo.calls[0][2] is None
    assert [row["tick"] for row in out["round_ends"]] == [30, 60]
    assert out["round_ends"][0]["winner"] == 2


def test_parser_failure_is_evidence_not_an_invented_boundary():
    class Broken:
        def parse_ticks(self, props, players=None, ticks=None):
            raise RuntimeError("boom")

    out, error = _parse_round_state_transitions(Broken(), PLAYERS)
    assert out is None and isinstance(error, RuntimeError)
    out, error = _parse_round_state_transitions(FakeDemo(_match()), [])
    assert out is None and isinstance(error, ValueError)


def test_observed_transitions_feed_the_round_streams_only_without_events():
    observed = {"round_starts": [{"tick": 10}], "round_ends": [{"tick": 30, "winner": 2}]}
    raw = {"header": {}, "warnings": [], "round_starts": [], "round_ends": [], "tick_rows": [],
           "round_state_transitions": observed}
    derive_round_streams_from_tick_evidence(raw)
    assert raw["round_starts"] == [{"tick": 10}]
    assert raw["round_ends"] == [{"tick": 30, "winner": 2}]
    assert any("observed_from_game_state" in warning for warning in raw["warnings"])

    real = {"header": {}, "warnings": [], "round_starts": [{"tick": 5}], "round_ends": [{"tick": 9}],
            "tick_rows": [], "round_state_transitions": observed}
    derive_round_streams_from_tick_evidence(real)
    assert real["round_starts"] == [{"tick": 5}] and real["round_ends"] == [{"tick": 9}]


def test_without_observed_ends_the_reviewed_start_derivation_still_applies():
    raw = {"header": {}, "warnings": [], "round_starts": [], "round_ends": [],
           "round_state_transitions": {"round_starts": [{"tick": 10}], "round_ends": []},
           "tick_rows": [
               {"tick": 2227, "total_rounds_played": 0, "game_time": 2440.203125,
                "round_start_time": 2431.78125},
               {"tick": 4398, "total_rounds_played": 0, "game_time": 2474.125,
                "round_start_time": 2431.78125},
           ]}
    derive_round_streams_from_tick_evidence(raw)
    assert all(row.get("derived_from") == "game_state.round_start_time" for row in raw["round_starts"])
    assert raw["round_ends"] == []


def _fixture() -> Path | None:
    override = os.getenv("CS2_DEMO_FIXTURE")
    return Path(override) if override and Path(override).is_file() else None


@pytest.mark.skipif(_fixture() is None, reason="needs a real CS2 demo with round events (CS2_DEMO_FIXTURE)")
def test_real_demo_parse_without_round_events_equals_the_event_based_parse(monkeypatch):
    """On a demo that DOES advertise round events, hiding them must not change the output."""
    path = str(_fixture())
    normal = P.parse_demo_file(path)
    original = P._available_events

    def hidden(demo):
        inventory, error = original(demo)
        return {n for n in inventory if n not in ("round_start", "round_end", "round_officially_ended")}, error

    monkeypatch.setattr(P, "_available_events", hidden)
    blind = P.parse_demo_file(path)
    a, b = normal.get("output", normal), blind.get("output", blind)
    keys = ("number", "start_tick", "end_tick", "winner_side", "winner_team",
            "bomb_planted", "bomb_defused", "bomb_exploded")
    assert [{k: r.get(k) for k in keys} for r in a["rounds"]] == [{k: r.get(k) for k in keys} for r in b["rounds"]]
    lifecycle = {"round_start", "round_end", "round_officially_ended"}
    assert [(e["type"], e["round"], e.get("tick")) for e in a["events"] if e["type"] not in lifecycle] == \
        [(e["type"], e["round"], e.get("tick")) for e in b["events"] if e["type"] not in lifecycle]
