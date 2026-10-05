#!/usr/bin/env python3
"""R5.8.3 read-only release preflight.

This gate proves the static/runtime binding needed before a fresh attestation.
It never dispatches workflows, executes a DEM, writes provenance, mutates Railway,
or authorizes Canonical admission.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Direct execution sets sys.path[0] to scripts/, not the repository root.
# Add the explicit root before importing the single shared attestation module;
# this keeps local and GitHub Actions execution independent of PYTHONPATH.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.parser_runtime_attestation import (
    BRANCH, COMMIT, DEPLOYMENT, DEPLOYMENT_SOURCE_COMMIT, ENVIRONMENT,
    EXPECTED_HASHES, PROJECT, REPOSITORY, SERVICE, WORKFLOW_PATH,
    mapping_authority_matches_artifact, runtime_identity,
)

RAILWAY_API = "https://backboard.railway.com/graphql/v2"
DOMAINS = (
    "https://parser.gamepro.network/version",
    "https://cs2-demo-parser-production.up.railway.app/version",
)
EXPECTED_IDENTITY = {
    "name": "demoparser2", "version": "0.42.0",
    "revision": f"git:{COMMIT}", "semantic_revision": f"git:{COMMIT}",
    "build_revision": f"git:{COMMIT}", "contract_version": 1,
}

def git_blob_sha(path_spec: str) -> str:
    data = subprocess.check_output(("git", "cat-file", "blob", path_spec), cwd=ROOT)
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()

def get_json(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(
        url, data=data,
        headers={"User-Agent": "gamepro-r5-8-3-preflight/1", **(headers or {})},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)

def railway_binding() -> dict[str, Any]:
    token = os.getenv("RAILWAY_API_TOKEN", "")
    if len(token) < 20:
        raise RuntimeError("RAILWAY_API_TOKEN_MISSING")
    query = "query($id:String!){deployment(id:$id){id status projectId serviceId environmentId meta}}"
    response = get_json(
        RAILWAY_API,
        data=json.dumps({"query": query, "variables": {"id": DEPLOYMENT}}, separators=(",", ":")).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    if response.get("errors"):
        raise RuntimeError("RAILWAY_API_QUERY_FAILED")
    deployment = (response.get("data") or {}).get("deployment")
    if not isinstance(deployment, dict):
        raise RuntimeError("RAILWAY_DEPLOYMENT_NOT_FOUND")
    meta = deployment.get("meta") if isinstance(deployment.get("meta"), dict) else {}
    observed = {
        "id": deployment.get("id"), "status": deployment.get("status"),
        "projectId": deployment.get("projectId"), "serviceId": deployment.get("serviceId"),
        "environmentId": deployment.get("environmentId"),
        "repo": meta.get("repo") or meta.get("repository"),
        "branch": meta.get("branch"), "commitHash": meta.get("commitHash") or meta.get("commit"),
    }
    expected = {
        "id": DEPLOYMENT, "status": "SUCCESS", "projectId": PROJECT,
        "serviceId": SERVICE, "environmentId": ENVIRONMENT, "repo": REPOSITORY,
        "branch": BRANCH, "commitHash": DEPLOYMENT_SOURCE_COMMIT,
    }
    if observed != expected:
        raise RuntimeError("RAILWAY_DEPLOYMENT_BINDING_MISMATCH")
    return observed

def main() -> int:
    if sys.argv[1:] == ["--self-check"]:
        print("R5_8_3_IMPORT_OK")
        return 0
    evidence: dict[str, Any] = {
        "schema_version": 1, "operation": "R5.8.3_READ_ONLY_PREFLIGHT",
        "side_effects": False, "checked_at": datetime.now(timezone.utc).isoformat(),
        "github": {"repository": os.getenv("GITHUB_REPOSITORY"), "ref": os.getenv("GITHUB_REF"), "sha": os.getenv("GITHUB_SHA")},
        "pins": {"repository": REPOSITORY, "runtime_branch": BRANCH, "semantic_commit": COMMIT,
                 "deployment": DEPLOYMENT, "deployment_source_commit": DEPLOYMENT_SOURCE_COMMIT},
    }
    failures: list[str] = []
    if os.getenv("GITHUB_REPOSITORY") != REPOSITORY:
        failures.append("GITHUB_REPOSITORY_MISMATCH")
    if os.getenv("GITHUB_REF") != "refs/heads/main":
        failures.append("GITHUB_REF_MISMATCH")
    try:
        subprocess.check_call(("git", "cat-file", "-e", f"{COMMIT}^{{commit}}"), cwd=ROOT)
        subprocess.check_call(("git", "merge-base", "--is-ancestor", COMMIT, f"origin/{BRANCH}"), cwd=ROOT)
        evidence["runtime_commit_ancestry"] = True
    except subprocess.CalledProcessError:
        evidence["runtime_commit_ancestry"] = False
        failures.append("RUNTIME_COMMIT_NOT_ANCESTOR")
    observed_hashes = {}
    for path, expected in EXPECTED_HASHES.items():
        observed = git_blob_sha(f"{COMMIT}:{path}")
        observed_hashes[path] = {"expected": expected, "observed": observed, "match": observed == expected}
        if observed != expected:
            failures.append(f"CRITICAL_HASH_MISMATCH:{path}")
    evidence["critical_hashes"] = observed_hashes
    registry = json.loads((ROOT / "scripts/approved_attestation_workflow.json").read_text())
    workflow_blob = git_blob_sha(f"HEAD:{WORKFLOW_PATH}")
    workflow_ok = registry.get("path") == WORKFLOW_PATH and registry.get("source_sha") == workflow_blob
    evidence["attestation_workflow"] = {"path": WORKFLOW_PATH, "registry_sha": registry.get("source_sha"),
                                        "observed_sha": workflow_blob, "approved": workflow_ok}
    if not workflow_ok:
        failures.append("ATTESTATION_WORKFLOW_REGISTRY_MISMATCH")
    parser_attestation = (ROOT / "src/lib/parserAttestation.ts").read_text()
    immutable_subject = "repo:GameProAcademy@323426481/cs2-pro-hub@1358428146:ref:refs/heads/main"
    evidence["oidc_immutable_subject_present"] = immutable_subject in parser_attestation
    if immutable_subject not in parser_attestation:
        failures.append("OIDC_IMMUTABLE_SUBJECT_MISSING")
    try:
        evidence["railway"] = railway_binding()
    except Exception as exc:
        evidence["railway"] = {"status": "BLOCKED", "reason": str(exc)}
        failures.append(str(exc))
    runtime = {}
    for url in DOMAINS:
        try:
            body = get_json(url)
            identity = runtime_identity(body)
            runtime[url] = {"available": True, "identity": identity, "raw_response_shape": "nested_parser" if isinstance(body.get("parser"), dict) else "flat", "match": identity == EXPECTED_IDENTITY}
            if identity != EXPECTED_IDENTITY:
                failures.append(f"RUNTIME_IDENTITY_MISMATCH:{url}")
        except Exception as exc:
            runtime[url] = {"available": False, "reason": str(exc)}
            failures.append(f"RUNTIME_ENDPOINT_UNAVAILABLE:{url}")
    evidence["runtime"] = runtime
    try:
        mapping_ok = mapping_authority_matches_artifact()
    except Exception:
        mapping_ok = False
    evidence["mapping_authority"] = {"artifact_matches": mapping_ok, "inventory_rows": 105,
                                     "authorized": 0, "generic": 0, "verified": 0,
                                     "canonical_admission": "BLOCKED"}
    if not mapping_ok:
        failures.append("MAPPING_AUTHORITY_MISMATCH")
    evidence["decision"] = "GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT" if not failures else "BLOCKED"
    evidence["failures"] = failures
    print(json.dumps(evidence, sort_keys=True, separators=(",", ":")))
    return 0 if not failures else 1

if __name__ == "__main__":
    raise SystemExit(main())
