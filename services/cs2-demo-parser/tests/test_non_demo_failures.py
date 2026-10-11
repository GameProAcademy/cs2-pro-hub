"""Resource exhaustion and cancellation are never recorded as "no data".

Before this change every handler below returned an empty table plus an error
object, so a MemoryError in parse_ticks/parse_grenades produced the same shape
as a demo without that stream and the parse carried on.
"""
from __future__ import annotations

import asyncio

import pytest

import parser as parser_module
from parser import (
    NON_DEMO_FAILURES,
    _audit_full_tick_domain,
    _available_events,
    _discover_updated_fields,
    _parse_event_with_context,
    _parse_grenades,
    _parse_ticks,
    classify_parser_exception,
    extract_raw_material,
)

FAILURES = [MemoryError, KeyboardInterrupt, SystemExit, GeneratorExit, asyncio.CancelledError]


class PanicException(BaseException):
    """Stand-in for pyo3_runtime.PanicException (a BaseException, not an Exception)."""


class Demo:
    """Minimal demo whose chosen API raises the chosen exception."""

    def __init__(self, failing: str, error: BaseException):
        self.failing = failing
        self.error = error
        self.tick_calls = 0

    def _maybe(self, name: str):
        if self.failing == name:
            raise self.error

    def parse_header(self):
        return {"map_name": "de_test", "playback_ticks": 1000}

    def list_updated_fields(self):
        self._maybe("list_updated_fields")
        return ["CCSPlayerPawn.m_iHealth"]

    def list_game_events(self):
        self._maybe("list_game_events")
        return ["round_start"]

    def parse_event(self, *_args, **_kwargs):
        self._maybe("parse_event")
        return [{"tick": 10, "total_rounds_played": 0}]

    def parse_ticks(self, *_args, **_kwargs):
        self.tick_calls += 1
        self._maybe("parse_ticks")
        return [{"tick": 10, "steamid": "76561198012345679"}]

    def parse_grenades(self):
        self._maybe("parse_grenades")
        return []

    def parse_player_info(self):
        self._maybe("parse_player_info")
        return []


def test_tuple_matches_the_documented_set():
    assert set(NON_DEMO_FAILURES) == set(FAILURES)


@pytest.mark.parametrize("failure", FAILURES)
def test_capability_handlers_propagate_non_demo_failures(failure):
    cases = [
        ("list_game_events", lambda demo: _available_events(demo)),
        ("parse_ticks", lambda demo: _parse_ticks(demo, [10, 20])),
        ("list_updated_fields", lambda demo: _discover_updated_fields(demo)),
        ("parse_grenades", lambda demo: _parse_grenades(demo)),
        ("parse_event", lambda demo: _parse_event_with_context(demo, "round_start")),
    ]
    for api, call in cases:
        with pytest.raises(failure):
            call(Demo(api, failure("out of resources")))


def test_parser_panics_and_ordinary_errors_remain_capability_evidence():
    # Unchanged behaviour: a parser panic or an ordinary error in one capability
    # is retained as evidence for that capability and does not abort the parse.
    for error in (PanicException("panicked at src/lib.rs"), RuntimeError("boom"), ValueError("bad")):
        rows, recorded = _parse_ticks(Demo("parse_ticks", error), [10])
        assert rows == [] and recorded is error
        rows, recorded = _parse_grenades(Demo("parse_grenades", error))
        assert rows == [] and recorded is error
        inventory, recorded = _available_events(Demo("list_game_events", error))
        assert inventory and recorded is error
    rows, recorded = _parse_event_with_context(Demo("parse_event", RuntimeError("boom")), "round_start")
    assert rows is None and isinstance(recorded, RuntimeError)


def test_full_tick_audit_stops_at_memory_error_instead_of_continuing(monkeypatch):
    monkeypatch.setattr(parser_module, "build_tick_intervals", lambda *_a, **_k: [(0, 9), (10, 19), (20, 29)])
    demo = Demo("parse_ticks", MemoryError())
    with pytest.raises(MemoryError):
        _audit_full_tick_domain(demo, ["health", "armor"], 30)
    # One attempt, not one per remaining interval and property batch.
    assert demo.tick_calls == 1

    # An ordinary failure is still recorded per interval and the audit continues.
    demo = Demo("parse_ticks", RuntimeError("boom"))
    coverage, summaries = _audit_full_tick_domain(demo, ["health", "armor"], 30)
    assert demo.tick_calls >= 3
    assert coverage is not None and summaries


@pytest.mark.parametrize("api", ["parse_ticks", "parse_grenades", "parse_player_info", "parse_event"])
def test_extract_raw_material_does_not_turn_memory_error_into_empty_domain(api):
    with pytest.raises(MemoryError):
        extract_raw_material(Demo(api, MemoryError()))


def test_classification_never_relabels_non_demo_failures_as_demo_defects():
    # The message contains words that the signature matcher would otherwise
    # read as a corrupted/unsupported/invalid demo.
    for text in ("corrupt", "unsupported", "invalid", "truncated", "not a demo"):
        for failure in (MemoryError, asyncio.CancelledError):
            error = failure(text)
            assert classify_parser_exception(error) is error
