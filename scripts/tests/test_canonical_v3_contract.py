"""canonical-demo-v3: contract completeness, v2 preservation, app policy parity and gate behaviour."""
import copy
import json
import re
from pathlib import Path

from scripts.canonical_mapping_gate import FIELD_SPECS
from scripts.canonical_v3 import gate
from scripts.canonical_v3.contract import (CONTRACT_VERSION, REPRESENTATION_STATES, SERVER, STATES,
                                           TERMINAL_STATES, build_contract)

ROOT = Path(__file__).resolve().parents[2]
TS_POLICY = (ROOT / "src/lib/canonical/canonicalContractV3.ts").read_text(encoding="utf-8")
COMMITTED = ROOT / "docs/client-parser/canonical-demo-v3/contract.json"


def test_every_one_of_the_105_fields_has_one_state_per_path():
    contract = build_contract()
    assert contract["fieldCount"] == len(FIELD_SPECS) == 105
    assert [f["id"] for f in contract["fields"]] == list(FIELD_SPECS)
    for field in contract["fields"]:
        assert set(field["paths"]) == {"server", "browser"}
        for path in field["paths"].values():
            assert path["state"] in STATES and path["why"]


def test_states_are_formal_and_distinct():
    required = {"available", "legitimately_empty", "unsupported", "identity_blocked", "tick_blocked",
                "not_verified", "parity_failed", "not_authorized"}
    assert set(STATES) == required
    for name, state in STATES.items():
        for key in ("meaning", "preconditions", "evidence", "nullable", "persist", "metrics", "display",
                    "terminal", "evolution"):
            assert key in state, (name, key)
    assert TERMINAL_STATES == required - {"not_verified", "parity_failed"}
    assert STATES["available"]["persist"] is True and STATES["identity_blocked"]["persist"] is False


def test_no_field_is_available_without_checks_and_unsupported_fields_have_exit_criteria():
    for field, server in SERVER.items():
        if server["state"] == "available":
            assert server["checks"], field
        if server["state"] == "unsupported":
            assert server["exit"], field


def test_browser_path_never_authorizes_and_never_borrows_server_results():
    contract = build_contract()
    for field in contract["fields"]:
        browser = field["paths"]["browser"]
        assert browser["state"] == "not_authorized"
        assert "not Canonical field parity" in browser["raw_parity_context"] or browser["raw_parity_context"].startswith("adapter")


def test_v2_is_untouched():
    inventory = json.loads((ROOT / "docs/client-parser/canonical-mapping-inventory.json").read_text(encoding="utf-8"))
    assert inventory["digest"].startswith("cf0549c2") and inventory["inventoryVersion"] == "canonical-demo-v2"
    assert all(row["canonicalAuthorization"] is False for row in inventory["rows"])


def test_committed_contract_is_the_generator_output():
    assert json.loads(COMMITTED.read_text(encoding="utf-8")) == build_contract()


def test_app_policy_matches_the_contract_exactly():
    fixed = {f: s["representation"] for f, s in SERVER.items() if s["state"] in REPRESENTATION_STATES}
    entries = re.findall(r'id: "([^"]+)",\s*entity: "[^"]+",\s*path: \[[^\]]*\],\s*representation: (null|\{\}|"[^"]*")',
                         TS_POLICY)
    ts = {fid: (None if rep.strip() == "null" else {} if rep.strip() == "{}" else rep.strip().strip('"')) for fid, rep in entries}
    assert ts == fixed
    assert f'CANONICAL_CONTRACT_V3 = "{CONTRACT_VERSION}"' in TS_POLICY
    assert re.search(r'CANONICAL_CONTRACT_V3_DIGEST =\s*"' + build_contract()["digest"] + '"', TS_POLICY)


def _evidence(label, contract, *, mutate=None):
    fields = {}
    for field in contract["fields"]:
        state = field["paths"]["server"]["state"]
        item = {"state": state, "run1": {"non_null": 1, "rows": 1, "digest": "x"}, "deterministic": True,
                "round_trip": {"status": "EQUAL"}}
        if state == "available":
            item["run1"]["checks"] = {c: {"ok": True, "detail": ""} for c in SERVER[field["id"]]["checks"]}
        else:
            item["run1"]["representation"] = {"ok": True, "detail": ""}
        fields[field["id"]] = item
    ev = {"label": label, "fields": fields}
    if mutate:
        mutate(ev)
    return ev


def test_gate_passes_only_with_complete_evidence_and_blocks_each_gap():
    contract = build_contract()
    good = [_evidence("a", contract), _evidence("b", contract)]
    assert gate.evaluate_server(contract, good)["status"] == "PASS"
    assert gate.evaluate_server(contract, good[:1])["status"] == "BLOCKED"  # one demo is not enough

    def nondeterministic(ev):
        ev["fields"]["CanonicalRoundPlayer.moneyStart"]["deterministic"] = False
    def failed_check(ev):
        ev["fields"]["CanonicalRound.startTick"]["run1"]["checks"]["tick_domain_rounds"]["ok"] = False
    def round_trip(ev):
        ev["fields"]["CanonicalEvent.tick"]["round_trip"]["status"] = "DIFFERENT"
    def representation(ev):
        ev["fields"]["CanonicalRoundPlayer.kills"]["run1"]["representation"]["ok"] = False
    def never_present(ev):
        ev["fields"]["CanonicalEvent.weapon"]["run1"]["non_null"] = 0
    def wrong_state(ev):
        ev["fields"]["CanonicalMatch.teamA"]["state"] = "available"
    for mutate, field in ((nondeterministic, "CanonicalRoundPlayer.moneyStart"), (failed_check, "CanonicalRound.startTick"),
                          (round_trip, "CanonicalEvent.tick"), (representation, "CanonicalRoundPlayer.kills"),
                          (wrong_state, "CanonicalMatch.teamA")):
        bad = [_evidence("a", contract, mutate=mutate), _evidence("b", contract, mutate=mutate)]
        result = gate.evaluate_server(contract, bad)
        assert result["status"] == "BLOCKED" and field in result["blockers"], field
    never = [_evidence("a", contract, mutate=never_present), _evidence("b", contract, mutate=never_present)]
    assert "CanonicalEvent.weapon" in gate.evaluate_server(contract, never)["blockers"]


def test_a_non_terminal_state_blocks_even_with_evidence():
    contract = copy.deepcopy(build_contract())
    contract["fields"][0]["paths"]["server"]["state"] = "not_verified"
    result = gate.evaluate_server(contract, [_evidence("a", contract), _evidence("b", contract)])
    assert result["status"] == "BLOCKED"


def test_browser_gate_requires_the_policy_markers(tmp_path):
    contract = build_contract()
    assert gate.evaluate_browser(contract)["status"] == "PASS"
    assert gate.evaluate_browser(contract, root=tmp_path)["status"] == "BLOCKED"
