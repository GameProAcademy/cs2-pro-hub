"""O8 (pending): the closed round-winner-evidence-v1 schema and its checks, on the cases shared with the app."""
import json
from pathlib import Path

from scripts.canonical_v3 import harness
from scripts.canonical_v3.contract import DECISIONS, SERVER

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / "docs/client-parser/canonical-demo-v3/o8-winner-evidence-cases.json").read_text())["cases"]


def test_schema_cases_agree_with_the_app():
    for case in CASES:
        assert (harness.winner_evidence_errors(case["metadata"]) == []) is case["ok"], case["name"]
        if case["ok"]:
            assert harness.confirmed_side(case["metadata"]["winnerEvidence"]) == case["side"], case["name"]


def test_o8_fields_are_pending_not_available():
    assert SERVER["CanonicalRound.metadata"]["state"] == "not_verified"
    assert SERVER["CanonicalRound.winningSide"]["state"] == "not_verified"
    assert SERVER["CanonicalRound.metadata"]["checks"] == ["winner_evidence_schema"] or \
        tuple(SERVER["CanonicalRound.metadata"]["checks"]) == ("winner_evidence_schema",)
    assert "PROPOSED" in DECISIONS["O8_round_winner_evidence"]


def _bundle(rounds):
    return {"rounds": rounds}


def test_checks_reject_a_conflict_shown_as_a_winner_and_accept_null_winners():
    confirmed = next(c for c in CASES if c["name"] == "confirmed_state")["metadata"]
    conflict = next(c for c in CASES if c["name"] == "conflicting")["metadata"]
    good = [{"roundNumber": 1, "winningSide": "CT", "metadata": confirmed},
            {"roundNumber": 2, "winningSide": None, "metadata": conflict}]
    vals = [r["winningSide"] for r in good]
    assert harness.run_check("in_or_null:CT,T", "CanonicalRound.winningSide", vals, _bundle(good))[0]
    assert harness.run_check("winner_side_matches_evidence", "CanonicalRound.winningSide", vals, _bundle(good))[0]
    bad = [dict(good[1], winningSide="T")]
    assert not harness.run_check("winner_side_matches_evidence", "CanonicalRound.winningSide", ["T"], _bundle(bad))[0]
    metas = [r["metadata"] for r in good]
    assert harness.run_check("winner_evidence_schema", "CanonicalRound.metadata", metas, _bundle(good))[0]
    assert not harness.run_check("winner_evidence_schema", "CanonicalRound.metadata", [{}], _bundle(good))[0]
