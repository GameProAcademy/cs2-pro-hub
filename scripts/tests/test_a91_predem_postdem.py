"""A9.1 real-DEM runs need a current pre-DEM approval; post-DEM gates come only
from their own sealed reports and never authorize anything.

The positive post-DEM fixture uses the public values sealed by run 38112341484
(2026-10-11, commit 2c5cded1) as published in its check annotations; it is a
contract fixture, not evidence for any current commit.
"""
import copy
import hashlib
import io
import json
import zipfile
from pathlib import Path

import pytest

from scripts.ci import a91_predem_postdem as a91

ROOT = Path(__file__).resolve().parents[2]
SHA = "d" * 40
NOW = 1_800_000_000.0
FINISHED = "2027-01-15T07:00:00Z"  # 1 h before NOW


def zipped(name, document):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(name, json.dumps(document))
    return buffer.getvalue()


BUILD = "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d"
SEMANTIC = "git:10815fb44e165963adfaf07f71c474ca628f4b7f"


def live(build=BUILD, semantic=SEMANTIC, matches=True):
    return {h: {"build": {"commit": build, "declared_revision_matches": matches},
                "parser": {"semantic_revision": semantic}} for h in a91.HOSTS}


def evidence(**override):
    doc = {"target_sha": SHA, "decision": "PASS", "predem_decision": "READY_FOR_PREDEM_REVIEW",
           "stages": {"predem_matrix": {"status": "PASS"},
                      "runtime": {"status": "PASS", "build_commit": BUILD, "semantic_revision": SEMANTIC}},
           "authorizes": {"attempt_9": False, "canonical": False, "real_dem_production": False,
                          "real_dem_laboratory_dispatch": True}}
    doc.update(override)
    return doc


def approval_case(**override):
    blob = zipped("h3e-activation-gate.json", evidence())
    case = dict(
        approval_run_id="555", sha=SHA, main_head=SHA, ref="refs/heads/main",
        run={"id": 555, "name": "H.3-E Activation Gate", "repository": {"full_name": a91.REPOSITORY},
             "head_branch": "main", "status": "completed", "conclusion": "success", "updated_at": FINISHED},
        newest_completed_id=555,
        artifacts=[{"name": f"h3e-activation-gate-{SHA}-555-1", "expired": False,
                    "digest": "sha256:" + hashlib.sha256(blob).hexdigest()}],
        blob=blob, now=NOW, live_versions=live())
    case.update(override)
    return case


def test_a_current_predem_approval_is_accepted():
    result = a91.evaluate_approval(**approval_case())
    assert result["ok"] is True
    assert result["approval"]["run_id"] == "555" and result["approval"]["sha"] == SHA
    assert result["approval"]["runtime"] == {"build_commit": BUILD, "semantic_revision": SEMANTIC}


def _with_evidence(**changes):
    blob = zipped("h3e-activation-gate.json", evidence(**changes))
    return approval_case(blob=blob, artifacts=[{"name": f"h3e-activation-gate-{SHA}-555-1", "expired": False,
                                                "digest": "sha256:" + hashlib.sha256(blob).hexdigest()}])


@pytest.mark.parametrize("case, reason", [
    (approval_case(ref="refs/heads/feature"), "NOT_MAIN"),
    (approval_case(main_head="e" * 40), "COMMIT_IS_NOT_MAIN_HEAD"),
    (approval_case(main_head=None), "COMMIT_IS_NOT_MAIN_HEAD"),
    (approval_case(approval_run_id=""), "APPROVAL_RUN_ID_INVALID"),
    (approval_case(approval_run_id="55 5"), "APPROVAL_RUN_ID_INVALID"),
    (approval_case(run=None), "APPROVAL_RUN_NOT_FOUND"),
    (approval_case(run=dict(approval_case()["run"], name="R5.8.4 Read-Only Gate Reconciliation")),
     "APPROVAL_IS_NOT_AN_ACTIVATION_RUN_OF_MAIN"),
    (approval_case(run=dict(approval_case()["run"], head_branch="other")), "APPROVAL_IS_NOT_AN_ACTIVATION_RUN_OF_MAIN"),
    (approval_case(run=dict(approval_case()["run"], conclusion="failure")), "APPROVAL_RUN_NOT_SUCCESS"),
    (approval_case(run=dict(approval_case()["run"], status="in_progress", conclusion=None)), "APPROVAL_RUN_NOT_SUCCESS"),
    (approval_case(newest_completed_id=556), "APPROVAL_SUPERSEDED"),
    (approval_case(now=NOW + 6 * 3600), "APPROVAL_STALE_OR_IN_THE_FUTURE"),
    (approval_case(now=NOW - 7200), "APPROVAL_STALE_OR_IN_THE_FUTURE"),
    (approval_case(artifacts=[]), "APPROVAL_EVIDENCE_NOT_FOUND"),
    (approval_case(blob=None), "APPROVAL_EVIDENCE_NOT_FOUND"),
    (approval_case(artifacts=[{"name": f"h3e-activation-gate-{'e' * 40}-555-1", "digest": "x"}]),
     "APPROVAL_EVIDENCE_NOT_FOUND"),
    (approval_case(artifacts=[dict(approval_case()["artifacts"][0], digest="sha256:" + "0" * 64)]),
     "APPROVAL_EVIDENCE_DIGEST_MISMATCH"),
    (_with_evidence(decision="BLOCKED"), "APPROVAL_EVIDENCE_NOT_PREDEM_READY"),
    (_with_evidence(predem_decision="BLOCKED"), "APPROVAL_EVIDENCE_NOT_PREDEM_READY"),
    (_with_evidence(target_sha="e" * 40), "APPROVAL_EVIDENCE_NOT_PREDEM_READY"),
    (_with_evidence(stages={"predem_matrix": {"status": "BLOCKED"}}), "APPROVAL_EVIDENCE_NOT_PREDEM_READY"),
    (_with_evidence(authorizes={"real_dem_laboratory_dispatch": True, "real_dem_production": True,
                                "attempt_9": False, "canonical": False}), "APPROVAL_AUTHORIZES_SOMETHING_ELSE"),
    (_with_evidence(authorizes={}), "APPROVAL_AUTHORIZES_SOMETHING_ELSE"),
    (_with_evidence(stages={"predem_matrix": {"status": "PASS"}}), "APPROVAL_RUNTIME_IDENTITY_MISSING"),
    (approval_case(live_versions=None), "LIVE_RUNTIME_UNAVAILABLE"),
    (approval_case(live_versions={a91.HOSTS[0]: live()[a91.HOSTS[0]]}), "LIVE_RUNTIME_UNAVAILABLE"),
    # a redeploy after the approval (as c0aa8a55 after #104)
    (approval_case(live_versions=live(build="e" * 40)), "LIVE_RUNTIME_DIFFERS_FROM_APPROVED"),
    (approval_case(live_versions=live(semantic="git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76")),
     "LIVE_RUNTIME_DIFFERS_FROM_APPROVED"),
    (approval_case(live_versions=live(matches=False)), "LIVE_RUNTIME_DIFFERS_FROM_APPROVED"),
    (approval_case(live_versions={a91.HOSTS[0]: live()[a91.HOSTS[0]], a91.HOSTS[1]: live(build="e" * 40)[a91.HOSTS[1]]}),
     "LIVE_RUNTIME_DIFFERS_FROM_APPROVED"),
])
def test_every_unproven_approval_is_refused(case, reason):
    result = a91.evaluate_approval(**case)
    assert result["ok"] is False and result["reason"] == reason


def test_unexpected_or_unreadable_evidence_is_refused():
    for blob in (zipped("other.json", evidence()), b"not a zip"):
        case = approval_case(blob=blob, artifacts=[{"name": f"h3e-activation-gate-{SHA}-555-1", "expired": False,
                                                    "digest": "sha256:" + hashlib.sha256(blob).hexdigest()}])
        assert a91.evaluate_approval(**case)["ok"] is False


# Public values sealed by run 38112341484 (see module docstring).
REPORT = {
    "status": "PASS", "test_fixture_only": False, "canonicalAuthorization": False, "attempt9Authorization": False,
    "productionAuthorization": False, "canonicalEligible": False,
    "fixture": {"sha256": a91.DEM_SHA256, "sizeBytes": a91.DEM_SIZE, "authorizationRef": "A9.1-M1-CACHE-REAL-DEM"},
    "parser": {"revision": "d3767705dc5846d73ed29db50eaeda58778dc934", "version": "0.42.0"},
    "wasmArtifact": {"artifactIdentity": "5ff3176186f6669592ed034730d06825c3925f34ac81db92de974f2f99216fd2"},
    "runs": {
        "python": [{"status": "SUCCEEDED", "normalizedDigest": "dcebbebc0258d832d89bc86a38d38c90f976ede35717c2e1272da80108564555"}] * 2,
        "wasm": [{"status": "SUCCEEDED", "normalizedDigest": "ab5fb4f763ffedd3d98112e01e61b5304a860ee91775ea214b318d0ed597022a"}] * 2,
    },
}
PARITY = {"status": "PASS", "comparableFailCount": 0, "blockedCount": 0, "notRunCount": 0,
          "field_diagnostics": {"field_count": 414, "field_pass_count": 414, "first_divergence": None},
          "comparisons": [{"field": d, "status": "PASS"} for d in ("playback_ticks", "tick_properties", "rounds")]}
DETERMINISM = {"status": "PASS", "pythonDeterministic": True, "wasmDeterministic": True, "identityStable": True}
APPROVAL = {"run_id": "555", "sha": SHA}


def test_sealed_reports_bound_to_an_approval_verify_the_four_post_dem_gates():
    result = a91.reconcile_postdem(APPROVAL, REPORT, PARITY, DETERMINISM)
    assert result["postdem_decision"] == "VERIFIED"
    assert {g: v["status"] for g, v in result["gates"].items()} == dict.fromkeys(
        ("python_wasm_parity", "determinism", "tick_authority", "runtime_frozen"), "VERIFIED")
    assert result["authorizes"] == {"production": False, "attempt_9": False, "canonical": False}


def test_the_same_reports_without_an_approval_fail():
    result = a91.reconcile_postdem(None, REPORT, PARITY, DETERMINISM)
    assert result["postdem_decision"] == "FAIL"
    assert all(v["evidence_ref"] == "POST_DEM_EVIDENCE_WITHOUT_PREDEM_APPROVAL" for v in result["gates"].values())


def _mutated(target, path, value):
    doc = copy.deepcopy(target)
    node = doc
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value
    return doc


@pytest.mark.parametrize("report, parity, determinism, gate", [
    (None, PARITY, DETERMINISM, "python_wasm_parity"),
    (REPORT, None, DETERMINISM, "python_wasm_parity"),
    (REPORT, PARITY, None, "determinism"),
    (_mutated(REPORT, ("fixture", "sha256"), "0" * 64), PARITY, DETERMINISM, "python_wasm_parity"),
    (_mutated(REPORT, ("fixture", "sizeBytes"), a91.DEM_SIZE - 1), PARITY, DETERMINISM, "determinism"),
    (_mutated(REPORT, ("test_fixture_only",), True), PARITY, DETERMINISM, "python_wasm_parity"),
    (_mutated(REPORT, ("productionAuthorization",), True), PARITY, DETERMINISM, "python_wasm_parity"),
    (REPORT, _mutated(PARITY, ("comparableFailCount",), 1), DETERMINISM, "python_wasm_parity"),
    (REPORT, _mutated(PARITY, ("field_diagnostics", "first_divergence"), {"table": "x"}), DETERMINISM, "python_wasm_parity"),
    (REPORT, _mutated(PARITY, ("field_diagnostics", "field_pass_count"), 413), DETERMINISM, "python_wasm_parity"),
    (_mutated(REPORT, ("runs", "wasm"), [REPORT["runs"]["wasm"][0], {"status": "SUCCEEDED", "normalizedDigest": "f" * 64}]),
     PARITY, DETERMINISM, "determinism"),
    (_mutated(REPORT, ("runs", "python"), REPORT["runs"]["python"][:1]), PARITY, DETERMINISM, "determinism"),
    (REPORT, PARITY, _mutated(DETERMINISM, ("wasmDeterministic",), False), "determinism"),
    (REPORT, _mutated(PARITY, ("comparisons",), [{"field": "playback_ticks", "status": "PASS"}]), DETERMINISM,
     "tick_authority"),
    (REPORT, PARITY, _mutated(DETERMINISM, ("identityStable",), False), "runtime_frozen"),
    (_mutated(REPORT, ("wasmArtifact",), {}), PARITY, DETERMINISM, "runtime_frozen"),
])
def test_any_missing_or_contradicting_result_leaves_its_gate_unproven(report, parity, determinism, gate):
    result = a91.reconcile_postdem(APPROVAL, report, parity, determinism)
    assert result["gates"][gate]["status"] == "NOT_PROVEN"
    assert result["postdem_decision"] == "BLOCKED"


def test_postdem_command_exits_non_zero_without_reports(tmp_path, monkeypatch):
    (tmp_path / "approval.json").write_text(json.dumps({"ok": True, "approval": APPROVAL}))
    (tmp_path / "reports").mkdir()
    out = tmp_path / "out.json"
    env = {"A91_PREDEM_FILE": str(tmp_path / "approval.json"), "A91_REPORTS_DIR": str(tmp_path / "reports"),
           "A91_POSTDEM_OUT": str(out)}
    assert a91.postdem(env) == 1
    assert json.loads(out.read_text())["postdem_decision"] == "BLOCKED"
    for name, doc in (("a91_real_dem_report.json", REPORT), ("parity_report.json", PARITY),
                      ("determinism_report.json", DETERMINISM)):
        (tmp_path / "reports" / name).write_text(json.dumps(doc))
    assert a91.postdem(env) == 0


def test_every_workflow_that_can_process_the_real_dem_requires_the_predem_approval():
    import yaml

    seen = []
    for path in sorted((ROOT / ".github/workflows").glob("*.yml")):
        text = path.read_text()
        if "A91_DEMO_URL" not in text and "rebuild_wasm_large_demo.py" not in text and "scripts/a91/execute.py" not in text:
            continue
        seen.append(path.name)
        workflow = yaml.safe_load(text)
        on = workflow.get(True) or workflow.get("on")
        assert set(on) == {"workflow_dispatch"}, path.name
        approval_input = on["workflow_dispatch"]["inputs"]["predem_approval_run_id"]
        assert approval_input["required"] is True and "default" not in approval_input
        jobs = workflow["jobs"]
        check = jobs["predem-approval"]
        assert "python3 scripts/ci/a91_predem_postdem.py precondition" in json.dumps(check)
        assert "continue-on-error" not in json.dumps(check)
        for name, job in jobs.items():
            if name == "predem-approval":
                continue
            assert job.get("needs") == "predem-approval", (path.name, name)
            assert "needs.predem-approval.result == 'success'" in job["if"], (path.name, name)
            assert "A91_DEMO_URL" not in json.dumps(check)
    assert seen == ["a91-real-dem-gate.yml", "a91-wasm-large-demo-remediation.yml"]
