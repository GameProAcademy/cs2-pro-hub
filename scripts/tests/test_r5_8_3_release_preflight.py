import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/r5_8_3_release_preflight.py"


def test_direct_workflow_entrypoint_resolves_shared_module_without_pythonpath():
    result = subprocess.run(
        (sys.executable, str(SCRIPT), "--self-check"),
        cwd=ROOT,
        env={},
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "R5_8_3_IMPORT_OK"


def test_preflight_source_remains_read_only():
    source = SCRIPT.read_text(encoding="utf-8")
    for forbidden in (
        "workflow_dispatches(",
        "/v1/parse",
        "claim_demo_parse_message",
        "canonical_authorization = true",
    ):
        assert forbidden not in source

def test_nested_runtime_version_payload_is_normalized_before_comparison():
    from scripts.r5_8_3_release_preflight import EXPECTED_IDENTITY, runtime_identity

    payload = {
        "parser": {
            "name": EXPECTED_IDENTITY["name"],
            "version": EXPECTED_IDENTITY["version"],
            "revision": EXPECTED_IDENTITY["revision"],
            "semantic_revision": EXPECTED_IDENTITY["semantic_revision"],
            "build_revision": EXPECTED_IDENTITY["build_revision"],
        },
        "contract_version": EXPECTED_IDENTITY["contract_version"],
        "runtime": {"production": True},
    }
    assert runtime_identity(payload) == EXPECTED_IDENTITY


DEPLOYED = "10815fb44e165963adfaf07f71c474ca628f4b7f"  # worker tree 8120c12a
OLD_SEMANTIC = "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76"  # worker tree bf25eb86


def _have(commit):
    return subprocess.run(("git", "cat-file", "-e", f"{commit}^{{commit}}"), cwd=ROOT).returncode == 0


def test_semantic_revision_is_checked_against_git_not_against_the_worker_flag():
    import pytest
    from scripts.r5_8_3_release_preflight import semantic_identity_failures

    if not (_have(DEPLOYED) and _have(OLD_SEMANTIC)):
        # On GitHub Actions the workflows fetch full history, so a missing
        # commit is a broken gate, never a reason to skip silently.
        assert not os.environ.get("GITHUB_ACTIONS"), "full history required on CI"
        pytest.skip("history not fetched")
    build = {"commit": DEPLOYED, "embedded": True, "source": "railway", "declared_revision_matches": True}
    observed_2026_10_12 = {"semantic_revision": f"git:{OLD_SEMANTIC}", "build_revision": f"git:{DEPLOYED}"}
    assert semantic_identity_failures(observed_2026_10_12, build) == ["SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD"]
    honest = {"semantic_revision": f"git:{DEPLOYED}", "build_revision": f"git:{DEPLOYED}"}
    assert semantic_identity_failures(honest, build) == []
    assert semantic_identity_failures(dict(honest, build_revision=f"git:{OLD_SEMANTIC}"), build) == [
        "BUILD_REVISION_NOT_EMBEDDED_COMMIT"]
    assert semantic_identity_failures(dict(honest, semantic_revision="pypi-0.42.0"), build) == [
        "SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD"]
    assert semantic_identity_failures(honest, dict(build, embedded=False)) == ["BUILD_IDENTITY_NOT_EMBEDDED"]
    assert semantic_identity_failures(honest, None) == ["BUILD_IDENTITY_NOT_EMBEDDED"]
    assert semantic_identity_failures(honest, dict(build, commit="f" * 40)) == [
        "BUILD_REVISION_NOT_EMBEDDED_COMMIT", "BUILD_COMMIT_UNKNOWN_TO_GIT"]



def test_live_semantic_build_pair_allows_only_the_two_reviewed_diagnostic_changes():
    from scripts.r5_8_3_release_preflight import semantic_identity_failures

    build = {
        "commit": "eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1",
        "embedded": True, "source": "railway", "declared_revision_matches": True,
    }
    observed = {
        "semantic_revision": "git:c2e045b0f71a7699c935b65ffe514fe526889de3",
        "build_revision": "git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1",
    }
    assert semantic_identity_failures(observed, build) == []


def test_semantic_build_delta_exception_does_not_allow_wrong_build_pin():
    from scripts.r5_8_3_release_preflight import semantic_identity_failures

    build = {
        "commit": "eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1",
        "embedded": True, "source": "railway", "declared_revision_matches": True,
    }
    observed = {
        "semantic_revision": "git:c2e045b0f71a7699c935b65ffe514fe526889de3",
        "build_revision": "git:c2e045b0f71a7699c935b65ffe514fe526889de3",
    }
    assert semantic_identity_failures(observed, build) == ["BUILD_REVISION_NOT_EMBEDDED_COMMIT"]


def test_semantic_build_delta_exception_rejects_an_unreviewed_added_file(monkeypatch):
    from scripts.r5_8_3_release_preflight import semantic_identity_failures
    import scripts.r5_8_3_release_preflight as preflight

    real_check_output = subprocess.check_output
    def changed_diff(command, **kwargs):
        if command[:3] == ("git", "diff", "--name-only"):
            return (
                "services/cs2-demo-parser/h3e91_execution.py\\n"
                "services/cs2-demo-parser/tests/test_h3e91_execution.py\\n"
                "services/cs2-demo-parser/worker.py\\n"
                "services/cs2-demo-parser/parser.py\\n"
            )
        return real_check_output(command, **kwargs)
    monkeypatch.setattr(preflight.subprocess, "check_output", changed_diff)
    build = {
        "commit": "eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1",
        "embedded": True, "source": "railway", "declared_revision_matches": True,
    }
    observed = {
        "semantic_revision": "git:c2e045b0f71a7699c935b65ffe514fe526889de3",
        "build_revision": "git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1",
    }
    assert semantic_identity_failures(observed, build) == ["SEMANTIC_BUILD_DELTA_NOT_APPROVED"]


def test_semantic_build_delta_rejects_an_unapproved_worker_change(monkeypatch):
    from scripts.r5_8_3_release_preflight import semantic_identity_failures
    import scripts.r5_8_3_release_preflight as preflight

    real_check_output = subprocess.check_output
    def changed_diff(command, **kwargs):
        if command[:3] == ("git", "diff", "--name-only"):
            return "services/cs2-demo-parser/worker.py\\nservices/cs2-demo-parser/parser.py\\n"
        return real_check_output(command, **kwargs)
    monkeypatch.setattr(preflight.subprocess, "check_output", changed_diff)
    build = {
        "commit": "eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1",
        "embedded": True, "source": "railway", "declared_revision_matches": True,
    }
    observed = {
        "semantic_revision": "git:c2e045b0f71a7699c935b65ffe514fe526889de3",
        "build_revision": "git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1",
    }
    assert semantic_identity_failures(observed, build) == ["SEMANTIC_BUILD_DELTA_NOT_APPROVED"]

def test_blocked_preflight_exits_non_zero_and_still_writes_its_evidence(tmp_path):
    # No GitHub context and no Railway token: the preflight must say BLOCKED,
    # exit 1, and leave the evidence file for the artifact upload.
    out = tmp_path / "r5-8-3-preflight.json"
    result = subprocess.run(
        (sys.executable, str(SCRIPT)), cwd=ROOT, check=False, capture_output=True, text=True,
        env={"PATH": "/usr/bin:/bin", "R583_EVIDENCE_OUT": str(out), "RAILWAY_API_TOKEN": ""},
        timeout=120,
    )
    import json

    assert result.returncode == 1
    document = json.loads(out.read_text())
    assert document["decision"] == "BLOCKED"
    assert "RAILWAY_API_TOKEN_MISSING" in document["failures"]
    assert "GITHUB_REF_MISMATCH" in document["failures"]
    assert "::error title=R5.8.3 decision::" in result.stdout


def test_workflow_cannot_mask_the_preflight_exit_status():
    import yaml

    workflow = yaml.safe_load((ROOT / ".github/workflows/r5-8-3-read-only-preflight.yml").read_text())
    steps = workflow["jobs"]["preflight"]["steps"]
    names = [s.get("name") for s in steps]
    preflight = steps[names.index("Verify read-only release bindings")]
    assert "|" not in preflight["run"].replace("||", ""), "no pipe may swallow the exit status"
    assert preflight.get("shell") == "bash" and "set -euo pipefail" in preflight["run"]
    assert preflight["env"]["R583_EVIDENCE_OUT"] == "r5-8-3-preflight.json"
    assert "continue-on-error" not in preflight
    assert names.index("Run focused attestation/governance tests") < names.index("Verify read-only release bindings")
    upload = steps[names.index("Preserve machine-readable evidence")]
    assert upload.get("if") == "always()" and upload["with"]["if-no-files-found"] == "error"
    for step in steps:
        assert "tee" not in (step.get("run") or "")


def test_mapping_counts_are_computed_from_the_inventory():
    from scripts.canonical_mapping_gate import FORBIDDEN_GENERIC_SOURCES
    from scripts.r5_8_3_release_preflight import mapping_authority_evidence
    import json

    observed = mapping_authority_evidence()
    rows = json.loads((ROOT / "docs/client-parser/canonical-mapping-inventory.json").read_text())["rows"]
    assert observed["computed_from"] == "docs/client-parser/canonical-mapping-inventory.json"
    assert observed["inventory_rows"] == len(rows) == 105
    assert observed["generic"] == sum(r["sourceField"] in FORBIDDEN_GENERIC_SOURCES for r in rows) == 0
    assert observed["authorized"] == sum(r["canonicalAuthorization"] is not False for r in rows) == 0
    assert observed["artifact_matches"] is True
    source = SCRIPT.read_text()
    assert '"inventory_rows": 105' not in source and '"generic": 0' not in source


def test_health_evidence_requires_exact_ok(monkeypatch):
    import scripts.r5_8_3_release_preflight as preflight

    answers = {"https://a/health": {"status": "ok"}, "https://b/health": {"status": "ok", "extra": 1}}

    def fake(url, **_):
        if url not in answers:
            raise OSError("unreachable")
        return answers[url]

    monkeypatch.setattr(preflight, "get_json", fake)
    observed = preflight.health_evidence(("https://a", "https://b", "https://c"))
    assert observed["https://a/health"]["ok"] is True
    assert observed["https://b/health"]["ok"] is False
    assert observed["https://c/health"] == {"ok": False, "reason": "OSError"}


def test_critical_hashes_are_compared_file_by_file_against_git():
    import pytest
    from scripts.r5_8_3_release_preflight import critical_hash_evidence

    if not _have(DEPLOYED):
        assert not os.environ.get("GITHUB_ACTIONS"), "full history required on CI"
        pytest.skip("history not fetched")
    real = {"services/cs2-demo-parser/worker.py": "ecaac3968d68e1ed8fc03f8dfea42c223869f473",
            "services/cs2-demo-parser/adapter.py": "34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71"}
    assert all(item["match"] for item in critical_hash_evidence(DEPLOYED, real).values())
    wrong = dict(real, **{"services/cs2-demo-parser/worker.py": "50a53b607d26f00b4de05c5e8998611959e27bd1"})
    observed = critical_hash_evidence(DEPLOYED, wrong)
    assert observed["services/cs2-demo-parser/worker.py"]["match"] is False
    assert observed["services/cs2-demo-parser/adapter.py"]["match"] is True
    missing = critical_hash_evidence(DEPLOYED, {"services/cs2-demo-parser/does_not_exist.py": "0" * 40})
    assert missing["services/cs2-demo-parser/does_not_exist.py"] == {
        "expected": "0" * 40, "observed": None, "match": False}


def test_a_removed_or_replaced_deployment_breaks_the_binding_but_proves_the_token(monkeypatch):
    import scripts.r5_8_3_release_preflight as preflight

    def answer(status, deployment_id=None, commit=None):
        def fake(url, **_):
            return {"data": {"deployment": {
                "id": deployment_id or preflight.DEPLOYMENT, "status": status, "projectId": preflight.PROJECT,
                "serviceId": preflight.SERVICE, "environmentId": preflight.ENVIRONMENT,
                "meta": {"repo": preflight.REPOSITORY, "branch": preflight.BRANCH,
                         "commitHash": commit or preflight.DEPLOYMENT_SOURCE_COMMIT}}}}
        return fake

    monkeypatch.setenv("RAILWAY_API_TOKEN", "r" * 40)
    monkeypatch.setattr(preflight, "get_json", answer("REMOVED"))
    removed = preflight.railway_binding()
    assert removed["api_query_succeeded"] is True and removed["binding_matches"] is False
    assert removed["mismatched_fields"] == ["status"]
    monkeypatch.setattr(preflight, "get_json", answer("SUCCESS", commit="c" * 40))
    rebuilt = preflight.railway_binding()
    assert rebuilt["binding_matches"] is False and rebuilt["mismatched_fields"] == ["commitHash"]
    monkeypatch.setattr(preflight, "get_json", answer("SUCCESS"))
    assert preflight.railway_binding()["binding_matches"] is True
