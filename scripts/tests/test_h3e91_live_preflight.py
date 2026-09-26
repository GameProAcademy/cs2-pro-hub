from pathlib import Path
from unittest.mock import patch

from scripts.h3e91_live_preflight import APPROVED_BLOB, collect, git_blob_sha


def test_git_blob_hash_matches_git_framing():
    assert git_blob_sha(b"test content\n") == "d670460b4b4aece5915caf5c68d12f560a9fe3e4"


def test_collector_emits_safe_fail_closed_evidence(monkeypatch):
    env = {
        "GITHUB_REPOSITORY": "GameProAcademy/cs2-pro-hub",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_REF_TYPE": "branch",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_WORKFLOW": "H.3-E.9.1 Live Evidence Preflight",
        "GITHUB_WORKFLOW_REF": "GameProAcademy/cs2-pro-hub/.github/workflows/h3-e9-1-live-evidence-preflight.yml@refs/heads/main",
        "GITHUB_WORKFLOW_SHA": "a" * 40,
    }
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    with patch("scripts.h3e91_live_preflight.fetch_json", return_value=(None, None)):
        result = collect()
    assert result["railwayEvidence"]["available"]["status"] == "BLOCKED"
    assert result["transportEvidence"]["anonymousStatus"]["status"] == "BLOCKED"
    rendered = str(result)
    assert "Authorization" not in rendered
    assert "oidcToken" not in rendered


def test_collector_has_no_execution_or_mutation_surface():
    source = Path("scripts/h3e91_live_preflight.py").read_text()
    forbidden = ("parser_runtime_attestation.py", "workflow_dispatches", "/parse", ".dem", "mutation Railway")
    assert all(term not in source for term in forbidden)
    assert APPROVED_BLOB in source
