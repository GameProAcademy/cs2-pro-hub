#!/usr/bin/env python3
"""Build deterministic independent parser-runtime evidence; never writes provenance."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "GameProAcademy/cs2-pro-hub"
BRANCH = "infra/cs2-parser-worker-v8"
COMMIT = "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76"
DEPLOYMENT = "6330c8c4-a410-45db-a364-4eb47702c2fc"
PROJECT = "aa2176ec-0e35-45f0-8cfa-9f8c0707dca4"
SERVICE = "706fa246-a263-484f-a986-c74516be862b"
ENVIRONMENT = "2385d707-795d-4e32-a00b-0afaba0a9b7e"
EXPECTED_HASHES = {
    "services/cs2-demo-parser/parser.py": "9d21670e47ddf330881e95a9d78c19074ccc0aea",
    "services/cs2-demo-parser/adapter.py": "34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71",
    "services/cs2-demo-parser/worker.py": "dfc2e67fcb3644be91108079f9096947c16119b3",
    "services/cs2-demo-parser/raw_evidence.py": "750195c1218abd53cfc77b6e8d2fb4a88e31579e",
    "services/cs2-demo-parser/settings.py": "35eecfb06223812137a4a2f17114aae57cb7fe54",
}
IDENTITY_FIELDS = ("name", "version", "revision", "semantic_revision", "build_revision")
WORKFLOW_PATH = ".github/workflows/parser-runtime-attestation.yml"


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode()).hexdigest()


def git_value(*args: str) -> str:
    return subprocess.check_output(("git", *args), cwd=ROOT, text=True).strip()


def git_object_bytes(spec: str) -> bytes:
    return subprocess.check_output(("git", "cat-file", "blob", spec), cwd=ROOT)


def git_blob_sha1(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def fetch_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "gamepro-parser-attestor/1"})
    with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310 - pinned HTTPS endpoints
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise ValueError("RUNTIME_RESPONSE_INVALID")
    return payload


def runtime_identity(payload: dict[str, Any]) -> dict[str, Any]:
    parser = payload.get("parser") if isinstance(payload.get("parser"), dict) else payload
    result = {field: parser.get(field) for field in IDENTITY_FIELDS}
    result["contract_version"] = payload.get("contract_version", payload.get("contractVersion"))
    return result


def build_attestation() -> dict[str, Any]:
    statuses: list[str] = []
    repository = os.getenv("GITHUB_REPOSITORY", "")
    ref_name = os.getenv("GITHUB_REF_NAME", "")
    sha = os.getenv("GITHUB_SHA", "")
    event = os.getenv("GITHUB_EVENT_NAME", "")
    run_id = os.getenv("GITHUB_RUN_ID", "")
    run_attempt = os.getenv("GITHUB_RUN_ATTEMPT", "")
    workflow_ref = os.getenv("GITHUB_WORKFLOW_REF", "")
    if repository != REPOSITORY:
        statuses.append("GITHUB_SOURCE_IDENTITY_MISMATCH")
    if event not in {"workflow_dispatch", "workflow_call"} or not run_id or not run_attempt:
        statuses.append("GITHUB_WORKFLOW_IDENTITY_MISSING")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        statuses.append("GITHUB_WORKFLOW_COMMIT_INVALID")
    expected_workflow_ref = f"{REPOSITORY}/{WORKFLOW_PATH}@"
    if not workflow_ref.startswith(expected_workflow_ref):
        statuses.append("GITHUB_WORKFLOW_REF_MISMATCH")

    try:
        git_value("cat-file", "-e", f"{COMMIT}^{{commit}}")
        tree = git_value("rev-parse", f"{COMMIT}^{{tree}}")
    except subprocess.CalledProcessError:
        tree = None
        statuses.append("RUNTIME_GIT_COMMIT_NOT_FOUND")
    runtime_ref = f"refs/remotes/origin/{BRANCH}"
    try:
        subprocess.check_call(
            ("git", "merge-base", "--is-ancestor", COMMIT, runtime_ref),
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        branch_contains_commit = True
    except subprocess.CalledProcessError:
        branch_contains_commit = False
        statuses.append("RUNTIME_BRANCH_DOES_NOT_CONTAIN_COMMIT")

    observed_hashes: dict[str, dict[str, Any]] = {}
    for path, expected in EXPECTED_HASHES.items():
        try:
            observed = git_blob_sha1(git_object_bytes(f"{COMMIT}:{path}"))
        except subprocess.CalledProcessError:
            observed = None
        observed_hashes[path] = {"expected": expected, "observed": observed, "match": observed == expected}
        if observed != expected:
            statuses.append(f"CRITICAL_HASH_MISMATCH:{path}")

    custom_version = fetch_json("https://parser.gamepro.network/version")
    custom_health = fetch_json("https://parser.gamepro.network/health")
    railway_version = fetch_json("https://cs2-demo-parser-production.up.railway.app/version")
    railway_health = fetch_json("https://cs2-demo-parser-production.up.railway.app/health")
    custom_identity = runtime_identity(custom_version)
    railway_identity = runtime_identity(railway_version)
    expected_identity = {
        "name": "demoparser2", "version": "0.42.0", "revision": f"git:{COMMIT}",
        "semantic_revision": f"git:{COMMIT}", "build_revision": f"git:{COMMIT}", "contract_version": 1,
    }
    if custom_identity != expected_identity or railway_identity != expected_identity or custom_identity != railway_identity:
        statuses.append("RUNTIME_IDENTITY_MISMATCH")

    railway_proof = os.getenv("RAILWAY_DEPLOYMENT_EVIDENCE_JSON")
    deployment_evidence: dict[str, Any] | None = None
    if railway_proof:
        deployment_evidence = json.loads(railway_proof)
        expected = {"deployment_id": DEPLOYMENT, "project_id": PROJECT, "service_id": SERVICE,
                    "environment_id": ENVIRONMENT, "source_branch": BRANCH, "source_commit": COMMIT}
        if any(deployment_evidence.get(key) != value for key, value in expected.items()):
            statuses.append("RAILWAY_DEPLOYMENT_BINDING_MISMATCH")
        if deployment_evidence.get("verification_source") != "RAILWAY_API" or deployment_evidence.get("independently_verified") is not True:
            statuses.append("RAILWAY_DEPLOYMENT_PROOF_UNTRUSTED")
    else:
        statuses.append("BLOCKED_EXTERNAL_PROOF")

    payload = {
        "schema_version": 2, "repository": REPOSITORY, "railway_branch": BRANCH,
        "git_commit": COMMIT, "git_tree": tree, "deployment_id": DEPLOYMENT,
        "railway_project_id": PROJECT, "railway_service_id": SERVICE,
        "railway_environment_id": ENVIRONMENT, "parser_name": "demoparser2",
        "parser_version": "0.42.0", "contract_version": 1,
        "semantic_revision": f"git:{COMMIT}", "build_revision": f"git:{COMMIT}",
        "runtime_health": {"custom": custom_health, "railway": railway_health},
        "custom_domain_version": custom_identity, "railway_domain_version": railway_identity,
        "critical_file_hashes": observed_hashes, "deployment_evidence": deployment_evidence,
        "runtime_identity": {"repository": REPOSITORY, "branch": BRANCH, "commit": COMMIT,
                             "tree": tree, "branch_contains_commit": branch_contains_commit},
        "workflow_identity": {"provider": "github_actions", "repository": repository,
                              "ref_name": ref_name, "workflow_ref": workflow_ref,
                              "run_id": run_id, "run_attempt": run_attempt, "workflow_sha": sha,
                              "event_name": event},
    }
    attestation_digest = digest(payload)
    return {"status": "VERIFIED" if not statuses else "BLOCKED", "blockers": sorted(set(statuses)),
            "attestation_digest": attestation_digest, "payload": payload}


def main() -> int:
    output = Path(sys.argv[1] if len(sys.argv) > 1 else "parser-runtime-attestation.json")
    try:
        result = build_attestation()
    except Exception as exc:  # fail closed while preserving a machine-readable artifact
        result = {"status": "FAILED", "blockers": [f"{type(exc).__name__}:{exc}"], "payload": None,
                  "attestation_digest": None}
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(result["status"])
    return 0 if result["status"] == "VERIFIED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
