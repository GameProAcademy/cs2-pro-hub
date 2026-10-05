#!/usr/bin/env python3
"""Collect safe H.3-E.9.1 external evidence. Read-only except one anonymous negative POST."""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "GameProAcademy/cs2-pro-hub"
WORKFLOW_NAME = "H.3-E.9.1 Live Evidence Preflight"
WORKFLOW_PATH = ".github/workflows/h3-e9-1-live-evidence-preflight.yml"
ATTESTATION_WORKFLOW = ".github/workflows/parser-runtime-attestation.yml"
APPROVED_COLLECTOR_WORKFLOW = ".github/workflows/h3-e9-1-live-evidence-preflight.yml"
APPROVED_BLOB = "f2e1ede5d61770beeae53938d3c767b4884b6408"
ENDPOINT = "https://gamepro.network/api/public/parser-attestation"
PROJECT = "aa2176ec-0e35-45f0-8cfa-9f8c0707dca4"
SERVICE = "706fa246-a263-484f-a986-c74516be862b"
ENVIRONMENT = "2385d707-795d-4e32-a00b-0afaba0a9b7e"
DEPLOYMENT = "1b5778de-3eaf-46f1-9ea5-cba381d95313"
BRANCH = "infra/cs2-parser-worker-v8"
SOURCE_COMMIT = "91aeee853200d0f461d0d36af1781d7fdfa40941"
PARSER_REVISION = "git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76"
RUNTIME_DOMAINS = ("https://parser.gamepro.network", "https://cs2-demo-parser-production.up.railway.app")


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def safe(value: Any, source: str, observed_at: str, status: str | None = None) -> dict[str, Any]:
    if status is None:
        status = "PASS" if value not in (False, None, "") else "BLOCKED"
    return {"source": source, "observedAt": observed_at, "classification": "SAFE_NON_SECRET", "status": status, "value": value}


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def collector_structure_valid(source: str) -> bool:
    """Fail closed on changes to the manual-only diagnostic workflow structure."""
    forbidden = (r"(?m)^\s*(?:push|schedule|workflow_run|workflow_call|repository_dispatch):", r"\bactions\s*:\s*write\b", r"/parse\b", r"parser_runtime_attestation\.py", r"\b(?:workflow_dispatches|dispatches|mutation|INSERT|UPDATE|DELETE|TRUNCATE)\b")
    required = (r"(?m)^on:\s*\n\s+workflow_dispatch:\s*$", r"(?m)^permissions:\s*\n\s+contents:\s*read\s*\n\s+id-token:\s*write\s*$", r"(?m)^\s+if: github\.repository == 'GameProAcademy/cs2-pro-hub' && github\.ref == 'refs/heads/main' && github\.event_name == 'workflow_dispatch'\s*$", r"(?m)^\s+uses: actions/[\w-]+@[a-f0-9]{40}\b")
    return all(re.search(pattern, source) for pattern in required) and not any(re.search(pattern, source, re.I) for pattern in forbidden)


def fetch_json(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None) -> tuple[int | None, dict[str, Any] | None]:
    request = urllib.request.Request(url, data=data, headers={"User-Agent": "gamepro-h3e91-preflight/1", **(headers or {})}, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310 - pinned HTTPS endpoints
            payload = json.load(response)
            return response.status, payload if isinstance(payload, dict) else None
    except urllib.error.HTTPError as error:
        return error.code, None
    except (OSError, ValueError, json.JSONDecodeError):
        return None, None


def runtime_identity(payload: dict[str, Any] | None) -> dict[str, Any]:
    if not payload:
        return {}
    parser = payload.get("parser") if isinstance(payload.get("parser"), dict) else payload
    return {
        "name": parser.get("name"), "version": parser.get("version"),
        "revision": parser.get("revision") or parser.get("semantic_revision"),
        "contract": payload.get("contract_version", payload.get("contractVersion")),
    }


def collect() -> dict[str, Any]:
    observed_at = now()
    attestation_bytes = (ROOT / ATTESTATION_WORKFLOW).read_bytes()
    actual_blob = git_blob_sha(attestation_bytes)
    attestation_text = attestation_bytes.decode("utf-8")
    collector_file = ROOT / WORKFLOW_PATH
    collector_path_matches = collector_file.is_file() and WORKFLOW_PATH == APPROVED_COLLECTOR_WORKFLOW
    oidc_structure = collector_path_matches and collector_structure_valid(collector_file.read_text(encoding="utf-8"))

    token = os.getenv("RAILWAY_API_TOKEN", "")
    railway: dict[str, Any] | None = None
    if token:
        query = "query DeploymentEvidence($id: String!) { deployment(id: $id) { id status projectId serviceId environmentId meta } }"
        _, response = fetch_json("https://backboard.railway.com/graphql/v2", data=json.dumps({"query": query, "variables": {"id": DEPLOYMENT}}, separators=(",", ":")).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        candidate = (response or {}).get("data", {}).get("deployment") if isinstance((response or {}).get("data"), dict) else None
        railway = candidate if isinstance(candidate, dict) else None
    meta = railway.get("meta") if railway and isinstance(railway.get("meta"), dict) else {}

    runtime_results: list[tuple[int | None, dict[str, Any] | None, int | None, dict[str, Any] | None]] = []
    for domain in RUNTIME_DOMAINS:
        health_status, health = fetch_json(f"{domain}/health")
        version_status, version = fetch_json(f"{domain}/version")
        runtime_results.append((health_status, health, version_status, version))
    identities = [runtime_identity(item[3]) for item in runtime_results]
    available = [item[0] == 200 and item[2] == 200 for item in runtime_results]
    health_values = [(item[1] or {}).get("status") for item in runtime_results]
    expected_identity = {"name": "demoparser2", "version": "0.42.0", "revision": PARSER_REVISION, "contract": 1}

    endpoint_secret = os.getenv("PARSER_ATTESTATION_ENDPOINT", "")
    collector_workflow_sha = os.getenv("GITHUB_WORKFLOW_SHA", "")
    trigger_commit_sha = os.getenv("GITHUB_SHA", "")
    workflow_ref = os.getenv("GITHUB_WORKFLOW_REF", "")

    return {
        "schemaVersion": 1,
        "observedAt": observed_at,
        "workflowIdentity": {
            "repository": os.getenv("GITHUB_REPOSITORY", ""), "ref": os.getenv("GITHUB_REF", ""),
            "refType": os.getenv("GITHUB_REF_TYPE", ""), "eventName": os.getenv("GITHUB_EVENT_NAME", ""),
            "workflow": os.getenv("GITHUB_WORKFLOW", ""), "workflowRef": workflow_ref,
            "collectorWorkflowSha": collector_workflow_sha,
            "collectorTriggerCommitSha": trigger_commit_sha,
        },
        "workflowEvidence": {
            "approvedPathMatches": safe(collector_path_matches, "GIT_CHECKOUT", observed_at),
            "actualBlobSha": safe(actual_blob, "GIT_BLOB_BYTES", observed_at, "PASS" if actual_blob == APPROVED_BLOB else "BLOCKED"),
            "approvedBlobSha": safe(APPROVED_BLOB, "APPROVED_REGISTRY", observed_at, "PASS"),
            "blobMatches": safe(actual_blob == APPROVED_BLOB, "GIT_BLOB_COMPARISON", observed_at),
            "oidcStructureValid": safe(oidc_structure, "COLLECTOR_WORKFLOW_SOURCE", observed_at),
            "collectorWorkflowSha": safe(collector_workflow_sha, "GITHUB_WORKFLOW_IDENTITY", observed_at),
        },
        "secretPresence": {
            "endpointPresent": safe(bool(endpoint_secret), "GITHUB_SECRET_PRESENCE", observed_at),
            "transportSecretPresent": safe(bool(os.getenv("PARSER_ATTESTATION_TRANSPORT_SECRET")), "GITHUB_SECRET_PRESENCE", observed_at),
            "hmacSecretPresent": safe(bool(os.getenv("PARSER_ATTESTATION_HMAC_SECRET")), "GITHUB_SECRET_PRESENCE", observed_at),
            "railwayTokenPresent": safe(bool(token), "GITHUB_SECRET_PRESENCE", observed_at),
        },
        "railwayEvidence": {
            "available": safe(railway is not None, "RAILWAY_GRAPHQL_READ_ONLY", observed_at),
            "projectMatches": safe((railway or {}).get("projectId") == PROJECT, "RAILWAY_GRAPHQL_READ_ONLY", observed_at),
            "serviceMatches": safe((railway or {}).get("serviceId") == SERVICE, "RAILWAY_GRAPHQL_READ_ONLY", observed_at),
            "environmentMatches": safe((railway or {}).get("environmentId") == ENVIRONMENT, "RAILWAY_GRAPHQL_READ_ONLY", observed_at),
            "deploymentIdMatches": safe((railway or {}).get("id") == DEPLOYMENT, "RAILWAY_GRAPHQL_READ_ONLY", observed_at),
            "deploymentStatus": safe((railway or {}).get("status"), "RAILWAY_GRAPHQL_READ_ONLY", observed_at, "PASS" if (railway or {}).get("status") == "SUCCESS" else "BLOCKED"),
            "branchMatches": safe(meta.get("branch") == BRANCH, "RAILWAY_GRAPHQL_READ_ONLY", observed_at),
            "sourceCommitMatches": safe((meta.get("commitHash") or meta.get("commit")) == SOURCE_COMMIT, "RAILWAY_GRAPHQL_READ_ONLY", observed_at),
        },
        "runtimeEvidence": {
            "customDomainAvailable": safe(available[0], "PUBLIC_RUNTIME_GET", observed_at),
            "railwayDomainAvailable": safe(available[1], "PUBLIC_RUNTIME_GET", observed_at),
            "healthMatches": safe(all(value in ("ok", "healthy", "HEALTHY") for value in health_values) and health_values[0] == health_values[1], "PUBLIC_RUNTIME_GET", observed_at),
            "parserNameMatches": safe(all(identity.get("name") == expected_identity["name"] for identity in identities), "PUBLIC_RUNTIME_GET", observed_at),
            "parserVersionMatches": safe(all(identity.get("version") == expected_identity["version"] for identity in identities), "PUBLIC_RUNTIME_GET", observed_at),
            "parserRevisionMatches": safe(all(identity.get("revision") == expected_identity["revision"] for identity in identities), "PUBLIC_RUNTIME_GET", observed_at),
            "contractVersionMatches": safe(all(identity.get("contract") == expected_identity["contract"] for identity in identities), "PUBLIC_RUNTIME_GET", observed_at),
            "bothDomainsMatch": safe(available == [True, True] and identities[0] == identities[1], "PUBLIC_RUNTIME_COMPARISON", observed_at),
        },
        "transportEvidence": {
            "endpointMatches": safe(endpoint_secret == ENDPOINT, "GITHUB_CONFIGURATION_COMPARISON", observed_at),
            "anonymousStatus": safe(None, "TRUSTED_SERVER_NEGATIVE_POST_PENDING", observed_at, "UNKNOWN"),
            "preNegativeProvenanceCount": safe(None, "UNTRUSTED_RUNNER_NO_DATABASE_ACCESS", observed_at, "UNKNOWN"),
            "postNegativeProvenanceCount": safe(None, "UNTRUSTED_RUNNER_NO_DATABASE_ACCESS", observed_at, "UNKNOWN"),
            "preNegativeNonceCount": safe(None, "UNTRUSTED_RUNNER_NO_DATABASE_ACCESS", observed_at, "UNKNOWN"),
            "postNegativeNonceCount": safe(None, "UNTRUSTED_RUNNER_NO_DATABASE_ACCESS", observed_at, "UNKNOWN"),
            "noNegativePostSideEffect": safe(None, "UNTRUSTED_RUNNER_NO_DATABASE_ACCESS", observed_at, "UNKNOWN"),
        },
    }


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "h3-e9-external-evidence.json")
    target.write_text(json.dumps(collect(), sort_keys=True, separators=(",", ":")), encoding="utf-8")
