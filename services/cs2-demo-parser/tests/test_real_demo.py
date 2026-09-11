"""GATE 02 — real `.dem` integration test.

This test is READY but it needs a real CS2 demo. Nothing here fabricates a demo:
without the fixture the test is skipped and GATE 02 stays BLOCKED.

To run it, drop a real CS2 demo at:

    services/cs2-demo-parser/tests/fixtures/sample.dem

(or export `CS2_DEMO_FIXTURE=/absolute/path/to/file.dem`)

The fixture is git-ignored on purpose (size + privacy).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures"
CS2_DEMO_MAGIC = b"PBDEMS2\x00"


def _fixture_path() -> Path | None:
    override = os.getenv("CS2_DEMO_FIXTURE")
    if override:
        candidate = Path(override)
        return candidate if candidate.is_file() else None
    if FIXTURE_DIR.is_dir():
        for candidate in sorted(FIXTURE_DIR.glob("*.dem")):
            return candidate
    return None


pytestmark = pytest.mark.skipif(
    _fixture_path() is None,
    reason="GATE 02 BLOCKED: no real CS2 .dem fixture available (never fabricated)",
)


@pytest.fixture(scope="module")
def parsed():
    from parser import parse_demo_file

    path = _fixture_path()
    assert path is not None
    with path.open("rb") as handle:
        assert handle.read(len(CS2_DEMO_MAGIC)) == CS2_DEMO_MAGIC, "fixture is not a CS2 demo"
    return parse_demo_file(str(path))


def test_header_and_players_are_extracted(parsed):
    assert parsed["header"]["map"]
    assert parsed["players"], "a real demo must yield players"
    for player in parsed["players"]:
        assert player["steam_id"].isdigit() and len(player["steam_id"]) == 17


def test_rounds_and_events_are_extracted(parsed):
    assert parsed["rounds"], "a real demo must yield rounds"
    assert parsed["events"], "a real demo must yield events"
    assert any(event["type"] == "player_death" for event in parsed["events"])
    for event in parsed["events"]:
        assert "data" not in event
        assert isinstance(event["round"], int) and event["round"] > 0
    for entry in parsed["rounds"]:
        assert isinstance(entry["number"], int) and entry["number"] > 0


def test_real_parse_is_deterministic(parsed):
    from parser import parse_demo_file

    path = _fixture_path()
    assert path is not None
    again = parse_demo_file(str(path))
    assert json.dumps(parsed, sort_keys=True) == json.dumps(again, sort_keys=True)
