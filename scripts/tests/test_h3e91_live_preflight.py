from pathlib import Path
from unittest.mock import patch

from scripts.h3e91_live_preflight import (
    APPROVED_BLOB,
    BRANCH,
    PARSER_REVISION,
    DEPLOYMENT,
    SOURCE_COMMIT,
    collect,
    collector_structure_valid,
    git_blob_sha,
)


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
    monkeypatch.delenv("GITHUB_SHA", raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    with patch("scripts.h3e91_live_preflight.fetch_json", return_value=(None, None)):
        result = collect()
    assert result["railwayEvidence"]["available"]["status"] == "BLOCKED"
    assert result["transportEvidence"]["anonymousStatus"]["status"] == "UNKNOWN"
    assert result["workflowIdentity"]["collectorWorkflowSha"] == "a" * 40
    assert result["workflowIdentity"]["collectorTriggerCommitSha"] == ""
    assert result["workflowEvidence"]["approvedPathMatches"]["value"] is True
    assert result["workflowEvidence"]["oidcStructureValid"]["value"] is True
    rendered = str(result)
    assert "Authorization" not in rendered
    assert "oidcToken" not in rendered


def test_collector_has_no_execution_or_mutation_surface():
    source = Path("scripts/h3e91_live_preflight.py").read_text()
    forbidden = (
        "scripts/parser_runtime_attestation.py",
        ".workflow_dispatches(",
        'urlopen(f"{domain}/parse',
        'open("sample.dem"',
        "mutation Railway",
    )
    assert all(term not in source for term in forbidden)
    assert APPROVED_BLOB in source


def test_collector_uses_the_r5811_candidate_identity():
    # R5.8.20 (D33 parser release): the collector pins the active Railway deployment.
    assert DEPLOYMENT == "2edd7ed1-2703-42ad-abe3-ebe13d235e81"
    assert SOURCE_COMMIT == "c764f858ffa9df0ffa2740bdba450c7a37be2f3e"
    assert BRANCH == "main"
    assert PARSER_REVISION == "git:c764f858ffa9df0ffa2740bdba450c7a37be2f3e"


def test_collector_structure_rejects_automatic_and_execution_triggers():
    source = Path(".github/workflows/h3-e9-1-live-evidence-preflight.yml").read_text()
    assert collector_structure_valid(source)
    assert not collector_structure_valid(source.replace("workflow_dispatch:", "push:"))
    assert not collector_structure_valid(source + "\n  workflow_run:\n")
    assert not collector_structure_valid(source + "\n    run: python scripts/parser_runtime_attestation.py\n")
