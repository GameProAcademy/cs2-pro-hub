"""PM6 C: identity-free official-end evidence for cs2.match-integrity.v1."""
from adapter import build_match_end_evidence, build_raw_parser_output
from hot_payload import build_hot_payload
import parser as worker_parser


def _raw(**overrides):
    raw = {
        "header": {"map_name": "de_test"},
        "players": [],
        "round_starts": [{"tick": 100}, {"tick": 1100}],
        "round_ends": [{"tick": 900, "winner": "CT", "reason": "t_killed"},
                       {"tick": 1900, "winner": "T", "reason": "ct_surrender"}],
        "round_end_game_phase": [{"tick": 900, "game_phase": 2}, {"tick": 1900, "game_phase": 5}],
        "event_inventory": ["round_end", "round_start", "cs_win_panel_match"],
        "event_tables": {"cs_win_panel_match": [{"tick": 1950}]},
        "voided_rounds": [{"end_tick": 50}],
        "warnings": [],
    }
    raw.update(overrides)
    return raw


def test_evidence_joins_phase_and_reason_by_round_end_tick():
    out = build_raw_parser_output(_raw())
    ev = out["match_end_evidence"]
    assert ev["schema_version"] == 1 and ev["game_phase_available"] is True
    assert [(r["number"], r["end_tick"], r["reason"], r["game_phase"]) for r in ev["rounds"]] == [
        (1, 900, "t_killed", 2), (2, 1900, "ct_surrender", 5)]
    assert ev["win_panel_ticks"] == [1950] and ev["voided_rounds"] == 1


def test_unreadable_phase_and_panel_stay_unavailable_never_empty():
    ev = build_match_end_evidence(
        _raw(round_end_game_phase=None, event_tables={"cs_win_panel_match": None}),
        [{"number": 1, "end_tick": 900}])
    assert ev["game_phase_available"] is False
    assert ev["rounds"][0]["game_phase"] is None
    assert ev["win_panel_ticks"] is None


def test_panel_not_advertised_is_observed_absent():
    ev = build_match_end_evidence(_raw(event_inventory=["round_end"], event_tables={}), [])
    assert ev["win_panel_ticks"] == []


def test_evidence_carries_no_identity():
    ev = build_raw_parser_output(_raw())["match_end_evidence"]
    text = repr(ev)
    for key in ("steamid", "steam_id", "name", "user_", "attacker"):
        assert key not in text


def test_hot_payload_carries_bounded_evidence():
    parsed = build_raw_parser_output(_raw())
    hot = build_hot_payload(parsed, parser={"name": "demoparser2", "version": "0.42.2"}, contract_version=1,
                            demo_sha256="A" * 64, upload_id="u")
    ev = hot["match_end_evidence"]
    assert ev["rounds"][-1] == {"number": 2, "end_tick": 1900, "reason": "ct_surrender", "game_phase": 5}
    assert ev["win_panel_ticks"] == [1950] and ev["game_phase_available"] is True
    assert build_hot_payload({}, parser={"name": "x", "version": "y"}, contract_version=1,
                             demo_sha256="a" * 64, upload_id="u")["match_end_evidence"] is None


class _Frame:
    def __init__(self, rows):
        self.rows = rows
        self.columns = list(rows[0]) if rows else []

    def to_dict(self, orient):
        return self.rows

    def __len__(self):
        return len(self.rows)


class _Demo:
    def __init__(self, rows=None, fail=False):
        self.rows, self.fail = rows or [], fail

    def parse_event(self, name, *, other=None, player=None):
        if self.fail:
            raise ValueError("unavailable")
        assert name == "round_end" and other == ["game_phase"]
        return _Frame(self.rows)


def test_parser_reads_game_phase_at_round_end_and_skips_nan():
    rows = [{"tick": 900, "game_phase": 2.0}, {"tick": 1900, "game_phase": float("nan")},
            {"tick": 2900, "game_phase": 5}]
    assert worker_parser._parse_round_end_game_phase(_Demo(rows)) == [
        {"tick": 900, "game_phase": 2}, {"tick": 2900, "game_phase": 5}]


def test_parser_returns_none_when_phase_unreadable():
    assert worker_parser._parse_round_end_game_phase(_Demo(fail=True)) is None


def test_numeric_reasons_from_game_state_become_tokens():
    ev = build_match_end_evidence(
        _raw(round_ends=[{"tick": 900, "reason": 8}, {"tick": 1900, "reason": 17}]),
        [{"number": 1, "end_tick": 900}, {"number": 2, "end_tick": 1900}])
    assert [r["reason"] for r in ev["rounds"]] == ["t_killed", "t_surrender"]
