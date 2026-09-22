from unittest.mock import patch

import pytest

from scripts.parser_runtime_attestation import (
    COMMIT,
    DEPLOYMENT,
    ENVIRONMENT,
    PROJECT,
    REPOSITORY,
    SERVICE,
    digest,
    git_blob_sha1,
    mapping_authority_matches_artifact,
    railway_deployment_evidence,
    release_gate_evidence,
    runtime_identity,
    stable_json,
)


def test_canonical_serialization_is_deterministic():
    left = {"b": 2, "a": {"z": False, "x": None}}
    right = {"a": {"x": None, "z": False}, "b": 2}
    assert stable_json(left) == stable_json(right)
    assert digest(left) == digest(right)


def test_runtime_identity_preserves_required_fields():
    payload = {"parser": {"name": "demoparser2", "version": "0.42.0", "revision": "git:x",
                          "semantic_revision": "git:x", "build_revision": "git:x"}, "contract_version": 1}
    assert runtime_identity(payload) == {"name": "demoparser2", "version": "0.42.0",
        "revision": "git:x", "semantic_revision": "git:x", "build_revision": "git:x", "contract_version": 1}


def test_git_blob_hash_uses_object_database_framing():
    assert git_blob_sha1(b"test content\n") == "d670460b4b4aece5915caf5c68d12f560a9fe3e4"


def test_railway_evidence_is_derived_from_api_response():
    response = {"data": {"deployment": {"id": DEPLOYMENT, "status": "SUCCESS",
        "projectId": PROJECT, "serviceId": SERVICE, "environmentId": ENVIRONMENT,
        "meta": {"repo": REPOSITORY, "branch": "infra/cs2-parser-worker-v8", "commitHash": COMMIT}}}}
    with patch("scripts.parser_runtime_attestation.fetch_json", return_value=response):
        proof = railway_deployment_evidence("x" * 32)
    assert proof["verification_source"] == "RAILWAY_API"
    assert proof["independently_verified"] is True
    assert len(proof["query_digest"]) == 64


def test_railway_evidence_rejects_declarative_or_mismatched_data():
    with pytest.raises(ValueError, match="RAILWAY_API_TOKEN_MISSING"):
        railway_deployment_evidence("")
    response = {"data": {"deployment": {"id": DEPLOYMENT, "status": "SUCCESS",
        "projectId": PROJECT, "serviceId": SERVICE, "environmentId": ENVIRONMENT,
        "meta": {"repo": REPOSITORY, "branch": "legacy", "commitHash": COMMIT}}}}
    with patch("scripts.parser_runtime_attestation.fetch_json", return_value=response):
        with pytest.raises(ValueError, match="RAILWAY_DEPLOYMENT_BINDING_MISMATCH"):
            railway_deployment_evidence("x" * 32)


def test_release_evidence_is_explicitly_blocked_before_attempt_9():
    evidence = release_gate_evidence()
    assert len(evidence) == 22
    assert all(item["status"] == "BLOCKED" for item in evidence.values())
    assert evidence["mapping_inventory"]["row_count"] == 105
    assert evidence["mapping_inventory"]["authorized_count"] == 0
    assert evidence["mapping_inventory"]["generic_count"] == 0
    assert evidence["mapping_inventory"]["verified_count"] == 0
    assert evidence["mapping_inventory"]["release_id"] == "cf0549c2-dfbd-c4df-25b4-2ce8204edf87"


def test_mapping_authority_digests_match_reviewed_artifacts():
    assert mapping_authority_matches_artifact() is True
