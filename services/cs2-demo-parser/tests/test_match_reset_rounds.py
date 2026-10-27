"""D30 (2026-10-27): a round the game discarded by resetting its round counter is not a round.

Production evidence: Dust2 (sha 1c271096..., match 747c7a6b) was persisted with 17 rounds.
Round 1 (ticks 1-2795) was a knife round: total_rounds_played went 0 -> 1 at tick 2795,
then the server restarted the match (counter back to 0 at tick 3145, begin_new_match at
3499). The parser counted every +1 of the counter as a round end and ignored the reset, so
the knife round became round 1, its kill/assist entered the metrics and the halftime swap
landed before round 14.

The rule uses only the game's own reset evidence, never a round number, a kill count or a
weapon. Mirage (sha 1d98f8b6..., a legitimate pistol round 1, no reset) must be unchanged.
"""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import pytest

import parser as P
from parser import _parse_round_state_transitions, apply_match_reset_voiding, void_rounds_reset_by_game


def _rows(tick, *, freeze=False, warmup=False, played=0, status=0, reason=0, t_score=0, ct_score=0, phase=2):
    base = {"tick": tick, "is_freeze_period": freeze, "is_warmup_period": warmup, "game_phase": phase,
            "total_rounds_played": played, "round_win_status": status, "round_win_reason": reason}
    return [
        {**base, "team_num": 2, "team_rounds_total": t_score, "steamid": 1},
        {**base, "team_num": 3, "team_rounds_total": ct_score, "steamid": 2},
    ]


class FakeDemo:
    def __init__(self, rows):
        self.frame = pd.DataFrame(rows)

    def parse_ticks(self, props, players=None, ticks=None):
        frame = self.frame
        if players is not None:
            frame = frame[frame["steamid"].isin(players)]
        return frame.reset_index(drop=True)


PLAYERS = [{"steamid": 1, "team_number": 2}, {"steamid": 2, "team_number": 3}]


def _dust2_pattern():
    """The production Dust2 shape: knife round, counter reset in warmup, two live rounds."""
    rows = []
    rows += _rows(1, freeze=True)                                          # recording opens in freeze
    rows += _rows(1688)                                                    # knife round live
    rows += _rows(2795, played=1, status=3, reason=8, ct_score=1)          # knife round ends (CT)
    rows += _rows(3145, warmup=True, freeze=True, played=0)               # restart: counter back to 0
    rows += _rows(3272, warmup=True, played=0)
    rows += _rows(3498, freeze=True, played=0)                             # real round 1 freeze
    rows += _rows(12387, played=0)
    rows += _rows(16141, played=1, status=2, reason=9, t_score=1)         # real round 1 ends (T)
    rows += _rows(16461, played=1, freeze=True, t_score=1)                # real round 2 freeze
    rows += _rows(17741, played=1, t_score=1)
    rows += _rows(22038, played=2, status=2, reason=1, t_score=2)         # real round 2 ends (T)
    return rows


def _streams(demo_rows):
    out, error = _parse_round_state_transitions(FakeDemo(demo_rows), PLAYERS)
    assert error is None
    raw = {"warnings": [], "round_starts": [], "round_ends": [], "round_state_transitions": out}
    P.derive_round_streams_from_tick_evidence(raw)
    apply_match_reset_voiding(raw)
    return raw


def test_the_reset_is_observed_from_the_game_counter():
    out, error = _parse_round_state_transitions(FakeDemo(_dust2_pattern()), PLAYERS)
    assert error is None
    assert out["counter_resets"] == [
        {"tick": 3145, "rounds_after": 0, "derived_from": "game_state.total_rounds_played"}]
    assert out["end_counters"] == {2795: 1, 16141: 1, 22038: 2}


def test_dust2_pattern_knife_round_is_voided_and_the_match_starts_after_the_reset():
    raw = _streams(_dust2_pattern())
    assert [row["tick"] for row in raw["round_starts"]] == [3498, 16461]
    assert [row["tick"] for row in raw["round_ends"]] == [16141, 22038]
    assert raw["voided_rounds"] == [{"start_tick": 1, "end_tick": 2795, "reset_tick": 3145,
                                     "rounds_after_reset": 0,
                                     "derived_from": "game_state.total_rounds_played"}]
    assert any(w.startswith("rounds_voided_by_match_reset: 1 round(s)") for w in raw["warnings"])


def test_dust2_pattern_contract_has_only_live_rounds_and_drops_knife_events():
    raw = _streams(_dust2_pattern())
    raw["player_death"] = [
        {"tick": 2700, "attacker_steamid": "1", "user_steamid": "2", "weapon": "knife"},  # knife round
        {"tick": 15000, "attacker_steamid": "2", "user_steamid": "1", "weapon": "glock"},  # real round 1
    ]
    out = P.build_raw_parser_output(raw)
    assert [(r["number"], r["start_tick"], r["end_tick"]) for r in out["rounds"]] == [(1, 3498, 16141), (2, 16461, 22038)]
    kills = [e for e in out["events"] if e["type"] == "player_death"]
    assert [(e["round"], e["tick"]) for e in kills] == [(1, 15000)]
    # RAW material keeps the knife-round event: only the contract excludes it.
    assert any(row["tick"] == 2700 for row in raw["player_death"])


def test_mirage_pattern_pistol_round_one_without_a_reset_is_kept_unchanged():
    rows = []
    rows += _rows(1, freeze=True)
    rows += _rows(1691)
    rows += _rows(6664, played=1, status=2, reason=9, t_score=1)          # pistol round ends (T)
    rows += _rows(6984, played=1, freeze=True, t_score=1)
    rows += _rows(8264, played=1, t_score=1)
    rows += _rows(11689, played=2, status=3, reason=8, t_score=1, ct_score=1)
    out, _ = _parse_round_state_transitions(FakeDemo(rows), PLAYERS)
    assert "counter_resets" not in out
    raw = _streams(rows)
    assert [row["tick"] for row in raw["round_starts"]] == [1, 6984]
    assert [row["tick"] for row in raw["round_ends"]] == [6664, 11689]
    assert "voided_rounds" not in raw


def test_the_rule_does_not_look_at_weapons_or_round_numbers():
    """A rifle round before a restart is voided ("live on 3"); a knife-only round without a reset is kept."""
    starts = [{"tick": 10}, {"tick": 100}]
    ends = [{"tick": 50}, {"tick": 150}]
    # Restart after round "1" with rifle kills: voided because the game reset the counter.
    kept_s, kept_e, voided = void_rounds_reset_by_game(starts, ends, [{"tick": 60, "rounds_after": 0}], {50: 1, 150: 1})
    assert [s["tick"] for s in kept_s] == [100] and [e["tick"] for e in kept_e] == [150]
    assert [v["end_tick"] for v in voided] == [50]
    # No reset at all: nothing is voided, whatever happened inside the rounds.
    assert void_rounds_reset_by_game(starts, ends, [], {}) == (starts, ends, [])


def test_a_reset_after_the_last_round_voids_nothing():
    """The server starting a new match once this one is over must not erase the match."""
    starts = [{"tick": 10}, {"tick": 100}]
    ends = [{"tick": 50}, {"tick": 150}]
    resets = [{"tick": 200, "rounds_after": 0}]
    assert void_rounds_reset_by_game(starts, ends, resets, {50: 1, 150: 2}) == (starts, ends, [])


def test_a_restore_voids_only_the_replayed_rounds():
    """Counter 3 -> 1 (backup restore): rounds counted 2 and 3 are replayed, round 1 stays."""
    starts = [{"tick": t} for t in (10, 100, 200, 300, 400)]
    ends = [{"tick": t} for t in (50, 150, 250, 350, 450)]
    counters = {50: 1, 150: 2, 250: 3, 350: 2, 450: 3}
    kept_s, kept_e, voided = void_rounds_reset_by_game(starts, ends, [{"tick": 260, "rounds_after": 1}], counters)
    assert [e["tick"] for e in kept_e] == [50, 350, 450]
    assert [s["tick"] for s in kept_s] == [10, 300, 400]
    assert [(v["start_tick"], v["end_tick"]) for v in voided] == [(100, 150), (200, 250)]


def test_event_streams_use_begin_new_match():
    """Demos that advertise round_start/round_end: begin_new_match is the reset evidence."""
    raw = {
        "warnings": [],
        "round_starts": [{"tick": 10}, {"tick": 100}, {"tick": 200}],
        "round_ends": [{"tick": 50}, {"tick": 150}, {"tick": 250}],
        "match_restart_rows": [{"tick": 60, "is_warmup_period": True}],
    }
    apply_match_reset_voiding(raw)
    assert [s["tick"] for s in raw["round_starts"]] == [100, 200]
    assert [e["tick"] for e in raw["round_ends"]] == [150, 250]
    assert raw["voided_rounds"][0]["derived_from"] == "begin_new_match"


def test_begin_new_match_before_the_first_round_is_harmless():
    raw = {"warnings": [], "round_starts": [{"tick": 100}], "round_ends": [{"tick": 150}],
           "match_restart_rows": [{"tick": 5}]}
    apply_match_reset_voiding(raw)
    assert raw["round_starts"] == [{"tick": 100}] and raw["round_ends"] == [{"tick": 150}]
    assert "voided_rounds" not in raw and raw["warnings"] == []


# --------------------------------------------------------------------------- #
# Real demos (skipped unless the exact production DEMs are provided; never fabricated).
# --------------------------------------------------------------------------- #
DUST2_SHA = "1c2710967417153a3fa9a9ae09b1c320d032a176a4317f0cbaf904df638f1259"
MIRAGE_SHA = "1d98f8b6d937ddbd5b2cc486b4830b63dfa85fd6b17b0767b96aa011c0ac7a7f"


def _real(env: str) -> Path | None:
    value = os.getenv(env)
    return Path(value) if value and Path(value).is_file() else None


def _halftime_switch(rounds):
    switches = []
    for a, b in zip(rounds, rounds[1:]):
        sa, sb = a.get("sides") or {}, b.get("sides") or {}
        if sum(1 for k in sa if k in sb and sa[k] != sb[k]) >= 8:
            switches.append(b["number"])
    return switches


@pytest.mark.skipif(_real("D30_DUST2_DEM") is None, reason="needs the production Dust2 DEM (D30_DUST2_DEM)")
def test_real_dust2_has_sixteen_regulation_rounds_and_no_knife_round():
    out = P.parse_demo_file(str(_real("D30_DUST2_DEM")))
    assert out["raw_evidence"]["manifest"].get("demo_sha256") in (None, DUST2_SHA)
    rounds = out["rounds"]
    assert len(rounds) == 16
    assert rounds[0]["start_tick"] == 3498
    assert _halftime_switch(rounds) == [13]
    first_round_weapons = {e.get("weapon") for e in out["events"] if e["type"] == "player_death" and e["round"] == 1}
    assert first_round_weapons and not any(str(w).startswith("knife") for w in first_round_weapons)
    assert any(w.startswith("rounds_voided_by_match_reset: 1 round(s)") for w in out["warnings"])


@pytest.mark.skipif(_real("D30_MIRAGE_DEM") is None, reason="needs the production Mirage DEM (D30_MIRAGE_DEM)")
def test_real_mirage_pistol_round_one_is_kept():
    out = P.parse_demo_file(str(_real("D30_MIRAGE_DEM")))
    rounds = out["rounds"]
    assert len(rounds) == 23
    assert rounds[0]["start_tick"] == 1
    assert _halftime_switch(rounds) == [13]
    assert not any(w.startswith("rounds_voided_by_match_reset") for w in out["warnings"])
