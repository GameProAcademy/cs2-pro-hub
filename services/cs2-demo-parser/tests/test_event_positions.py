"""spatial-v1 layer A: player positions at the event's own tick (2026-11-12).

demoparser2 0.42.0 declares ``parse_event(event_name, *, player=None, other=None)``; the previous
positional call always raised TypeError and fell back to the plain stream. These tests pin the
keyword call, restrict positions to ``player_death``, keep every other stream on the exact call
production effectively made, and pin the field governance of the new raw columns.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from parser import _EVENT_POSITION_PROPS, _POSITION_EVENTS, _parse_event_with_context
from raw_evidence import MAPPED_RAW_FIELDS, REVIEWED_RAW_ONLY_EVENT_FIELDS


class KeywordOnlyDemo:
    """Mirrors demoparser2 0.42.0: properties are keyword-only."""

    def __init__(self):
        self.calls = []

    def parse_event(self, event_name, *, player=None, other=None):
        self.calls.append((event_name, player, other))
        return [{"tick": 1, "event_name": event_name}]


def test_player_death_requests_xyz_by_keyword():
    demo = KeywordOnlyDemo()
    rows, error = _parse_event_with_context(demo, "player_death")
    assert error is None and rows == [{"tick": 1, "event_name": "player_death"}]
    assert demo.calls == [("player_death", ["X", "Y", "Z"], None)]


@pytest.mark.parametrize("name", ["player_hurt", "weapon_fire", "bomb_planted", "round_start"])
def test_other_streams_keep_the_plain_call(name):
    demo = KeywordOnlyDemo()
    _parse_event_with_context(demo, name)
    assert demo.calls == [(name, None, None)]


def test_only_deaths_carry_positions_and_only_xyz():
    assert _POSITION_EVENTS == frozenset({"player_death"})
    assert _EVENT_POSITION_PROPS == ("X", "Y", "Z")


def test_a_failing_props_call_still_falls_back_to_the_plain_stream():
    class Fails(KeywordOnlyDemo):
        def parse_event(self, event_name, *, player=None, other=None):
            self.calls.append((event_name, player, other))
            if player:
                raise ValueError("unknown prop")
            return [{"tick": 2}]

    demo = Fails()
    rows, error = _parse_event_with_context(demo, "player_death")
    assert rows == [{"tick": 2}] and error is None
    assert demo.calls == [("player_death", ["X", "Y", "Z"], None), ("player_death", None, None)]


def test_new_raw_columns_are_governed():
    for axis in "XYZ":
        target, canonical, status = MAPPED_RAW_FIELDS[f"player_death.attacker_{axis}"]
        assert (target, canonical, status) == (f"events[].position.{axis.lower()}", "CanonicalEvent.data.position", "MAPPED")
        target, canonical, status = MAPPED_RAW_FIELDS[f"player_death.user_{axis}"]
        assert (target, canonical, status) == (f"events[].victim_position.{axis.lower()}", "CanonicalEvent.data.victim_position", "MAPPED")
        # The assister's position is returned too, but nothing reads it: RAW only, not promoted.
        assert f"assister_{axis}" in REVIEWED_RAW_ONLY_EVENT_FIELDS["player_death"]
        assert f"player_death.assister_{axis}" not in MAPPED_RAW_FIELDS


DEMO = os.getenv("CS2_DEMO_FIXTURE")


@pytest.mark.skipif(not DEMO or not Path(DEMO).is_file(), reason="needs CS2_DEMO_FIXTURE (a real demo, never fabricated)")
def test_real_demo_deaths_carry_both_positions():
    from parser import parse_demo_file

    out = parse_demo_file(DEMO)
    deaths = [e for e in out["events"] if e["type"] == "player_death"]
    assert deaths
    with_both = [e for e in deaths if e.get("position") and e.get("victim_position")]
    assert len(with_both) == len(deaths)
    for e in with_both:
        for p in (e["position"], e["victim_position"]):
            assert set(p) == {"x", "y", "z"} and all(abs(v) < 20000 for v in p.values())
    # No other event type gains a position.
    assert not [e for e in out["events"] if e["type"] != "player_death" and ("position" in e or "victim_position" in e)]
    gates = {g["gate"]: g["status"] for g in out["raw_evidence"]["gates"]}
    assert gates["RAW→CANONICAL"] == "PASS"
