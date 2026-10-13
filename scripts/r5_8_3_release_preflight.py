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

WORKER_DIR = "services/cs2-demo-parser"


def critical_hash_evidence(commit: str, expected: dict[str, str]) -> dict[str, dict[str, Any]]:
    """Git blob of each critical file at `commit`, compared with its pin.

    A file missing at that commit is a mismatch, never an exception that hides
    the other comparisons.
    """
    out: dict[str, dict[str, Any]] = {}
    for path, pin in expected.items():
        try:
            observed = git_blob_sha(f"{commit}:{path}")
        except subprocess.CalledProcessError:
            observed = None
        out[path] = {"expected": pin, "observed": observed, "match": observed is not None and observed == pin}
    return out


def worker_tree(commit: str) -> str | None:
    out = subprocess.run(("git", "rev-parse", f"{commit}:{WORKER_DIR}"), cwd=ROOT,
                         capture_output=True, text=True, check=False)
    return out.stdout.strip() if out.returncode == 0 else None


def semantic_identity_failures(identity: dict[str, Any], build: dict[str, Any] | None) -> list[str]:
    """Check the semantic revision against git, independently of every pin.

    The worker's `declared_revision_matches` only compares the build revision
    with the embedded commit. The semantic revision must name a commit whose
    worker tree is the tree the image was built from.
    """
    build = build if isinstance(build, dict) else {}
    commit = build.get("commit")
    if build.get("embedded") is not True or not isinstance(commit, str) or len(commit) != 40:
        return ["BUILD_IDENTITY_NOT_EMBEDDED"]
    failures = []
    if identity.get("build_revision") != f"git:{commit}":
        failures.append("BUILD_REVISION_NOT_EMBEDDED_COMMIT")
    semantic = identity.get("semantic_revision")
    semantic_commit = semantic[4:] if isinstance(semantic, str) and semantic.startswith("git:") else ""
    built = worker_tree(commit)
    if built is None:
        failures.append("BUILD_COMMIT_UNKNOWN_TO_GIT")
    elif len(semantic_commit) != 40 or worker_tree(semantic_commit) != built:
        failures.append("SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD")
    return failures


def annotations(evidence: dict[str, Any]) -> list[str]:
    """Workflow commands carrying the decision; only codes, never secret values."""
    level = "notice" if evidence.get("decision") == "GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT" else "error"
    text = json.dumps({"decision": evidence.get("decision"), "failures": evidence.get("failures")},
                      sort_keys=True).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    return [f"::{level} title=R5.8.3 decision::{text}"]


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
    # The query itself succeeded: that proves the token, whatever the binding.
    observed["api_query_succeeded"] = True
    observed["binding_matches"] = observed_binding_matches = all(observed[k] == v for k, v in expected.items())
    if not observed_binding_matches:
        observed["mismatched_fields"] = sorted(k for k, v in expected.items() if observed[k] != v)
    return observed


def mapping_authority_evidence() -> dict[str, Any]:
    """Counts computed from the committed inventory, never literals.

    `generic` uses the repository's own definition
    (scripts/canonical_mapping_gate.FORBIDDEN_GENERIC_SOURCES).
    """
    from scripts.canonical_mapping_gate import FORBIDDEN_GENERIC_SOURCES

    path = "docs/client-parser/canonical-mapping-inventory.json"
    rows = json.loads((ROOT / path).read_text(encoding="utf-8")).get("rows")
    rows = rows if isinstance(rows, list) else []
    try:
        matches = mapping_authority_matches_artifact()
    except Exception:
        matches = False
    return {
        "computed_from": path,
        "artifact_matches": matches,
        "inventory_rows": len(rows),
        "authorized": sum(1 for r in rows if not isinstance(r, dict) or r.get("canonicalAuthorization") is not False),
        "generic": sum(1 for r in rows if not isinstance(r, dict) or r.get("sourceField") in FORBIDDEN_GENERIC_SOURCES),
        "canonical_admission": "BLOCKED",
    }


def health_evidence(base_urls: tuple[str, ...]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for base in base_urls:
        url = base + "/health"
        try:
            body = get_json(url)
            out[url] = {"ok": body == {"status": "ok"}, "observed": body if isinstance(body, dict) else None}
        except Exception as exc:
            out[url] = {"ok": False, "reason": type(exc).__name__}
    return out

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
    observed_hashes = critical_hash_evidence(COMMIT, EXPECTED_HASHES)
    failures.extend(f"CRITICAL_HASH_MISMATCH:{path}" for path, item in observed_hashes.items() if not item["match"])
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
        if not evidence["railway"]["binding_matches"]:
            failures.append("RAILWAY_DEPLOYMENT_BINDING_MISMATCH")
    except Exception as exc:
        evidence["railway"] = {"status": "BLOCKED", "reason": str(exc)}
        failures.append(str(exc))
    runtime = {}
    for url in DOMAINS:
        try:
            body = get_json(url)
            identity = runtime_identity(body)
            semantic_failures = semantic_identity_failures(identity, body.get("build"))
            runtime[url] = {"available": True, "identity": identity, "build": body.get("build"),
                            "raw_response_shape": "nested_parser" if isinstance(body.get("parser"), dict) else "flat",
                            "semantic_identity_failures": semantic_failures,
                            "match": identity == EXPECTED_IDENTITY and not semantic_failures}
            if identity != EXPECTED_IDENTITY:
                failures.append(f"RUNTIME_IDENTITY_MISMATCH:{url}")
            failures.extend(f"{code}:{url}" for code in semantic_failures)
        except Exception as exc:
            runtime[url] = {"available": False, "reason": str(exc)}
            failures.append(f"RUNTIME_ENDPOINT_UNAVAILABLE:{url}")
    evidence["runtime"] = runtime
    evidence["health"] = health_evidence(tuple(url.removesuffix("/version") for url in DOMAINS))
    for url, item in evidence["health"].items():
        if not item["ok"]:
            failures.append(f"RUNTIME_HEALTH_NOT_OK:{url}")
    try:
        evidence["mapping_authority"] = mapping_authority_evidence()
    except Exception as exc:
        evidence["mapping_authority"] = {"artifact_matches": False, "reason": type(exc).__name__}
    mapping = evidence["mapping_authority"]
    if not (mapping.get("artifact_matches") is True and mapping.get("inventory_rows") == 105
            and mapping.get("authorized") == 0 and mapping.get("generic") == 0):
        failures.append("MAPPING_AUTHORITY_MISMATCH")
    evidence["decision"] = "GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT" if not failures else "BLOCKED"
    evidence["failures"] = failures
    out = os.getenv("R583_EVIDENCE_OUT")
    document = json.dumps(evidence, sort_keys=True, separators=(",", ":"))
    if out:
        Path(out).write_text(document + "\n", encoding="utf-8")
        for line in annotations(evidence):
            print(line)
    else:
        print(document)
    return 0 if not failures else 1

if __name__ == "__main__":
    raise SystemExit(main())
