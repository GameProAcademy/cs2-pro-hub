"""D33 (2026-10-28): per-round economy read directly at each round boundary.

Production evidence (630 player-rounds of Dust2 747c7a6b, Mirage 95186f3f, Cache 48e517e4):
money_start and equipment_value were stored for 9 and money_end for 13, because they were
read from the capped, thinned general tick sample. The Dust2 DEM holds all 10 players'
balances at every round start tick.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

import parser as P
from parser import _parse_round_economy, enrich_rounds_from_tick_evidence

A, B, C, D = (f"7656119800000000{i}" for i in range(1, 5))


class FakeDemo:
    def __init__(self, rows=None, error=None):
        self.rows, self.error, self.calls = rows or [], error, []

    def parse_ticks(self, props, ticks=None):
        self.calls.append((list(props), list(ticks or [])))
        if self.error:
            raise self.error
        wanted = set(ticks or [])
        return [row for row in self.rows if row["tick"] in wanted]


def _row(tick, steamid, team, **values):
    return {"tick": tick, "steamid": steamid, "team_num": team, **values}


def test_two_bounded_reads_at_the_round_boundary_ticks_only():
    demo = FakeDemo([
        _row(100, A, 3, start_balance=800, balance=800, round_start_equip_value=200, current_equip_value=200),
        _row(400, A, 3, balance=3250),
    ])
    economy, error = _parse_round_economy(demo, [100, None, 100, True], [400, -1])
    assert error is None
    assert demo.calls == [(list(P.ECONOMY_START_PROPS), [100]), (list(P.ECONOMY_END_PROPS), [400])]
    assert economy["start"] == {100: {"money_start": {A: 800}, "equipment_value": {A: 200}}}
    assert economy["end"] == {400: {"money_end": {A: 3250}}}
    assert economy["start_ticks"] == [100] and economy["end_ticks"] == [400]


def test_semantics_start_balance_and_round_start_equipment_are_preferred():
    """Mid-freeze-time the live balance already reflects purchases; the round-start
    account does not. Equipment is what the player held when the round started."""
    demo = FakeDemo([
        _row(100, A, 2, start_balance=3550, balance=400, round_start_equip_value=200, current_equip_value=3350),
        _row(100, B, 3, balance=2100, current_equip_value=1000),  # fallbacks only
    ])
    economy, _ = _parse_round_economy(demo, [100], [])
    assert economy["start"][100]["money_start"] == {A: 3550, B: 2100}
    assert economy["start"][100]["equipment_value"] == {A: 200, B: 1000}


def test_absent_is_never_zero_and_zero_is_kept():
    demo = FakeDemo([
        _row(100, A, 2, start_balance=0, round_start_equip_value=0),       # real zeros
        _row(100, B, 3, start_balance=None, balance=float("nan")),        # nothing usable
        _row(100, C, 3, start_balance=True, round_start_equip_value="200"),  # wrong types
    ])
    economy, _ = _parse_round_economy(demo, [100], [])
    assert economy["start"][100]["money_start"] == {A: 0}
    assert economy["start"][100]["equipment_value"] == {A: 0}


def test_spectators_unknown_players_and_conflicts_are_dropped():
    demo = FakeDemo([
        _row(100, A, 1, start_balance=800),     # spectator / coach
        _row(100, None, 2, start_balance=800),  # no Steam id
        _row(100, B, 2, start_balance=800), _row(100, B, 2, start_balance=900),  # conflict
        _row(100, C, 3, start_balance=800), _row(100, C, 3, start_balance=800),  # duplicate, same value
        _row(555, D, 3, start_balance=800),     # not a requested tick
    ])
    economy, _ = _parse_round_economy(demo, [100], [])
    assert economy["start"][100]["money_start"] == {C: 800}


def test_failures_are_evidence_not_values():
    economy, error = _parse_round_economy(FakeDemo(error=RuntimeError("bad")), [100], [400])
    assert economy == {} and isinstance(error, RuntimeError)
    economy, error = _parse_round_economy(FakeDemo(), [], [])
    assert economy == {} and error is not None
    economy, error = _parse_round_economy(object(), [100], [])
    assert economy == {} and isinstance(error, AttributeError)


def test_enrichment_uses_the_dedicated_read_per_round_and_never_carries_values_over():
    raw = {
        "tick_rows": [_row(100, A, 2, start_balance=1, round_start_equip_value=1)],  # stale sample
        "round_economy": {
            "start": {100: {"money_start": {A: 800, B: 800}, "equipment_value": {A: 200, B: 200}},
                      500: {"money_start": {A: 3550}, "equipment_value": {A: 200}}},
            "end": {400: {"money_end": {A: 3250, B: 0}}},
            "start_ticks": [100, 500], "end_ticks": [400, 900],
        },
    }
    output = {"rounds": [
        {"number": 1, "start_tick": 100, "end_tick": 400},
        {"number": 2, "start_tick": 500, "end_tick": 900},  # end read returned nobody
    ]}
    enrich_rounds_from_tick_evidence(raw, output)
    r1, r2 = output["rounds"]
    assert r1["money_start"] == {A: 800, B: 800} and r1["equipment_value"] == {A: 200, B: 200}
    assert r1["money_end"] == {A: 3250, B: 0}
    assert r2["money_start"] == {A: 3550} and "money_end" not in r2  # absent, not carried, not 0
    assert B not in r2["money_start"]


def test_without_the_dedicated_read_the_sample_is_unchanged():
    raw = {"tick_rows": [_row(100, A, 2, start_balance=800, round_start_equip_value=200)]}
    output = {"rounds": [{"number": 1, "start_tick": 100, "end_tick": 400}]}
    enrich_rounds_from_tick_evidence(raw, output)
    assert output["rounds"][0]["money_start"] == {A: 800}
    assert output["rounds"][0]["equipment_value"] == {A: 200}


# --------------------------------------------------------------------------- #
# Real demos (skipped unless the exact production DEMs are provided; never fabricated).
# --------------------------------------------------------------------------- #
def _real(env: str) -> Path | None:
    value = os.getenv(env)
    return Path(value) if value and Path(value).is_file() else None


def _assert_full_economy(out, rounds_expected, halftime):
    rounds = out["rounds"]
    assert len(rounds) == rounds_expected
    for r in rounds:
        roster = set(r["sides"])
        assert len(roster) == 10
        for field in ("money_start", "equipment_value", "money_end"):
            assert set(r[field]) == roster, (r["number"], field)
            assert all(isinstance(v, (int, float)) and v >= 0 for v in r[field].values())
    # Pistol rounds start at the game's fixed 800, after the knife round (Dust2) and after halftime.
    for number in (1, halftime):
        assert set(rounds[number - 1]["money_start"].values()) == {800}


@pytest.mark.skipif(_real("D30_DUST2_DEM") is None, reason="needs the production Dust2 DEM (D30_DUST2_DEM)")
def test_real_dust2_economy_is_complete_for_every_player_and_round():
    _assert_full_economy(P.parse_demo_file(str(_real("D30_DUST2_DEM"))), 16, 13)


@pytest.mark.skipif(_real("D30_MIRAGE_DEM") is None, reason="needs the production Mirage DEM (D30_MIRAGE_DEM)")
def test_real_mirage_economy_is_complete_for_every_player_and_round():
    _assert_full_economy(P.parse_demo_file(str(_real("D30_MIRAGE_DEM"))), 23, 13)
