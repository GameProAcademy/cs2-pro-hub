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
