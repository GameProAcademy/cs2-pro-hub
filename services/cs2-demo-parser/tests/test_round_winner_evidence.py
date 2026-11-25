"""R-07 round-winner-evidence-v1: winner, method and status per round, from evidence only."""

from adapter import ROUND_WINNER_EVIDENCE_VERSION, normalize_rounds, round_winner_evidence

STATE = "game_state.total_rounds_played"


def test_version_is_declared():
    assert ROUND_WINNER_EVIDENCE_VERSION == "round-winner-evidence-v1"


def test_game_state_path_confirmed():
    out = round_winner_evidence({"tick": 30, "derived_from": STATE, "winner": 2, "winner_check": "agree"}, None)
    assert out == {"winner_side": "T", "winner_method": "game_state", "winner_status": "confirmed",
                   "winner_sources": {"round_end_event": None, "game_state": "T"}}


def test_round_end_event_path_confirmed():
    out = round_winner_evidence({"tick": 30, "winner": 3}, None)
    assert out["winner_side"] == "CT"
    assert (out["winner_method"], out["winner_status"]) == ("round_end_event", "confirmed")


def test_event_token_terrorist_is_event_evidence():
    out = round_winner_evidence({"tick": 30, "winner_team": "TERRORIST"}, None)
    assert (out["winner_side"], out["winner_method"]) == ("T", "round_end_event")


def test_both_sources_agree():
    out = round_winner_evidence({"tick": 30, "winner": 3},
                                {"tick": 31, "derived_from": STATE, "winner": 3, "winner_check": "agree"})
    assert (out["winner_side"], out["winner_method"], out["winner_status"]) == ("CT", "both", "confirmed")


def test_both_sources_conflict_no_winner_chosen():
    out = round_winner_evidence({"tick": 30, "winner": 3},
                                {"tick": 30, "derived_from": STATE, "winner": 2, "winner_check": "agree"})
    assert "winner_side" not in out
    assert out["winner_status"] == "conflicting"
    assert out["winner_sources"] == {"round_end_event": "CT", "game_state": "T"}


def test_neither_source_is_absent_never_a_loss():
    assert round_winner_evidence(None, None) == {
        "winner_status": "absent", "winner_sources": {"round_end_event": None, "game_state": None}}
    assert round_winner_evidence({"tick": 30}, None)["winner_status"] == "absent"


def test_game_state_disagreement_is_inconclusive():
    out = round_winner_evidence({"tick": 60, "derived_from": STATE, "winner_check": "disagree"}, None)
    assert "winner_side" not in out
    assert (out["winner_method"], out["winner_status"]) == ("game_state", "inconclusive")


def test_event_kept_when_game_state_is_inconclusive():
    out = round_winner_evidence({"tick": 30, "winner": 2},
                                {"tick": 30, "derived_from": STATE, "winner_check": "disagree"})
    assert (out["winner_side"], out["winner_method"], out["winner_status"]) == ("T", "round_end_event", "confirmed")


def test_normalize_rounds_matches_the_audit_by_tick():
    starts = [{"tick": 0}, {"tick": 100}, {"tick": 200}]
    ends = [{"tick": 90, "winner": 3}, {"tick": 190, "winner": 2}, {"tick": 290, "winner": 3}]
    audit = [{"tick": 91, "derived_from": STATE, "winner": 3, "winner_check": "agree"},
             {"tick": 190, "derived_from": STATE, "winner": 3, "winner_check": "agree"}]
    rounds = normalize_rounds(starts, ends, bombs={}, tickrate=64.0, warnings=[], state_audit=audit)
    assert [(r.get("winner_side"), r["winner_method"], r["winner_status"]) for r in rounds] == [
        ("CT", "both", "confirmed"),
        (None, "both", "conflicting"),
        ("CT", "round_end_event", "confirmed"),
    ]
