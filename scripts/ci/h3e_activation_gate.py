#!/usr/bin/env python3
"""H.3-E activation gate: repeatable, read-only, fail-closed.

Replaces the one-shot H.3-E.5 / H.3-E.6 workflows, which ran only when the
previous head of main was one fixed commit and were skipped on every other push.

For one target commit of main (the current head) this gate proves, or refuses:

  prerequisites  the push runs of Quality Gates (including `Main required gates`),
                 F553 post-completion, R5.8.3 and R5.8.4 for that exact commit
                 succeeded, and the R5.8.3 / R5.8.4 evidence artifacts say so in
                 their *decision*, not only in their check colour;
  transport      the attestation endpoint refuses a request without the
                 transport secret (401) and accepts the secret while rejecting
                 the empty payload (400 ATTESTATION_PAYLOAD_INVALID). No
                 attestation is ever submitted;
  runtime        both worker hosts answer /health and /version, report one
                 embedded build commit whose declared revision matches, Railway's
                 active deployment was built from that commit, and that commit's
                 `services/cs2-demo-parser` tree is identical to the target's;
                 the declared semantic revision names a commit of the target's
                 history whose worker tree is that same deployed tree.

Every stage is PASS, FAIL, BLOCKED or SKIPPED. Only PASS everywhere gives the
decision PASS. SKIPPED is never evidence. The gate never dispatches a workflow,
submits an attestation, runs a demo, writes provenance or changes Railway.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

PASS, FAIL, BLOCKED, SKIPPED = "PASS", "FAIL", "BLOCKED", "SKIPPED"
SHA = re.compile(r"^[0-9a-f]{40}$")

REPOSITORY = "GameProAcademy/cs2-pro-hub"
WORKER_DIR = "services/cs2-demo-parser"
ATTESTATION_ENDPOINT = "https://gamepro.network/api/public/parser-attestation"
HOSTS = ("https://parser.gamepro.network", "https://cs2-demo-parser-production.up.railway.app")
RAILWAY_API = "https://backboard.railway.com/graphql/v2"
RAILWAY = {
    "projectId": "aa2176ec-0e35-45f0-8cfa-9f8c0707dca4",
    "serviceId": "706fa246-a263-484f-a986-c74516be862b",
    "environmentId": "2385d707-795d-4e32-a00b-0afaba0a9b7e",
}
WORKFLOWS = {
    "quality_gates": ("quality-gates.yml", "Quality Gates", "push"),
    "f553_post_completion": ("f553-r11-post-completion.yml", "F553 R11.2 post-completion attestation", "workflow_run"),
    "r5_8_3": ("r5-8-3-read-only-preflight.yml", "R5.8.3 Read-Only Release Preflight", "push"),
    "r5_8_4": ("r5-8-4-gate-reconciliation.yml", "R5.8.4 Read-Only Gate Reconciliation", "workflow_run"),
}
R583_GREEN = "GREEN_FOR_FRESH_ATTESTATION_PREFLIGHT"
R584_GREEN = "READY_FOR_OPERATOR_REVIEW"
SIDE_EFFECTS = {
    "dem_execution": "NOT_RUN",
    "attestation_execution": "NOT_RUN",
    "provenance_write": "NOT_RUN",
    "railway_mutation": "NOT_RUN",
    "workflow_dispatch": "NOT_RUN",
}


def stage(status: str, **details: Any) -> dict[str, Any]:
    assert status in (PASS, FAIL, BLOCKED, SKIPPED)
    return {"status": status, **details}


# --------------------------------------------------------------------------- pure evaluation


def latest_run(runs: list[dict[str, Any]], *, sha: str, event: str) -> dict[str, Any] | None:
    """The newest run of one workflow for one commit and event (reruns included)."""
    mine = [r for r in runs if r.get("head_sha") == sha and r.get("event") == event
            and r.get("head_branch") == "main"
            and (r.get("repository") or {}).get("full_name") == REPOSITORY]
    if not mine:
        return None
    return max(mine, key=lambda r: (int(r.get("run_number") or 0), int(r.get("run_attempt") or 0)))


def evaluate_run(run: dict[str, Any] | None, *, name: str) -> dict[str, Any]:
    if run is None:
        return stage(BLOCKED, reason="RUN_NOT_FOUND")
    common = {"run_id": run.get("id"), "run_attempt": run.get("run_attempt"), "url": run.get("html_url")}
    if run.get("name") != name:
        return stage(FAIL, reason="WORKFLOW_NAME_MISMATCH", **common)
    if run.get("status") != "completed":
        return stage(BLOCKED, reason="RUN_NOT_COMPLETED", observed=run.get("status"), **common)
    if run.get("conclusion") != "success":
        # skipped, cancelled, failure, neutral, timed_out: none of them is evidence.
        return stage(FAIL, reason="RUN_NOT_SUCCESS", observed=run.get("conclusion"), **common)
    return stage(PASS, **common)


def evaluate_producer(run: dict[str, Any] | None, *, name: str) -> dict[str, Any]:
    """Whether a run's evidence may be read: the right workflow, completed, and
    finished as success or failure. R5.8.3 and R5.8.4 fail when their decision
    is not green, and their evidence still says why; the run itself is judged
    separately by `evaluate_run`, so reading it never turns a failure into a pass."""
    if run is None:
        return stage(BLOCKED, reason="RUN_NOT_FOUND")
    if run.get("name") != name:
        return stage(FAIL, reason="WORKFLOW_NAME_MISMATCH")
    if run.get("status") != "completed" or run.get("conclusion") not in ("success", "failure"):
        return stage(BLOCKED, reason="EVIDENCE_RUN_NOT_FINISHED", observed=run.get("conclusion") or run.get("status"))
    return stage(PASS)


def evaluate_job(jobs: list[dict[str, Any]], *, job_name: str) -> dict[str, Any]:
    matching = [j for j in jobs if j.get("name") == job_name]
    if len(matching) != 1:
        return stage(BLOCKED, reason="JOB_NOT_FOUND_EXACTLY_ONCE", observed=len(matching))
    job = matching[0]
    if job.get("conclusion") != "success":
        return stage(FAIL, reason="JOB_NOT_SUCCESS", observed=job.get("conclusion"))
    return stage(PASS, job_id=job.get("id"))


def evaluate_artifact(meta: dict[str, Any] | None, blob: bytes | None, *, run_id: Any,
                      expected_name: str) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Integrity of one evidence artifact; returns (stage, parsed json)."""
    if meta is None or blob is None:
        return stage(BLOCKED, reason="ARTIFACT_NOT_FOUND", expected_name=expected_name), None
    if meta.get("name") != expected_name or meta.get("expired"):
        return stage(FAIL, reason="ARTIFACT_NAME_OR_EXPIRY_MISMATCH", observed=meta.get("name")), None
    if (meta.get("workflow_run") or {}).get("id") != run_id:
        return stage(FAIL, reason="ARTIFACT_FROM_ANOTHER_RUN"), None
    digest = "sha256:" + hashlib.sha256(blob).hexdigest()
    if meta.get("digest") != digest:
        return stage(FAIL, reason="ARTIFACT_DIGEST_MISMATCH", observed=digest), None
    try:
        with zipfile.ZipFile(_bytes_io(blob)) as archive:
            names = archive.namelist()
            if len(names) != 1:
                return stage(FAIL, reason="ARTIFACT_CONTENT_UNEXPECTED", observed=names), None
            document = json.loads(archive.read(names[0]))
    except (zipfile.BadZipFile, ValueError):
        return stage(FAIL, reason="ARTIFACT_UNREADABLE"), None
    return stage(PASS, artifact_id=meta.get("id"), digest=digest), document


def evaluate_r583(document: dict[str, Any], *, sha: str) -> dict[str, Any]:
    if (document.get("github") or {}).get("sha") != sha:
        return stage(FAIL, reason="R583_EVIDENCE_FOR_ANOTHER_COMMIT")
    if document.get("side_effects") is not False:
        return stage(FAIL, reason="R583_SIDE_EFFECTS_NOT_FALSE")
    if document.get("decision") != R583_GREEN or document.get("failures"):
        return stage(FAIL, reason="R583_DECISION_NOT_GREEN", decision=document.get("decision"),
                     failures=list(document.get("failures") or []))
    return stage(PASS, decision=document.get("decision"))


def evaluate_r584(document: dict[str, Any], *, r583_run_id: Any, sha: str) -> dict[str, Any]:
    source = document.get("source") if isinstance(document.get("source"), dict) else {}
    if str(source.get("workflow_run_id")) != str(r583_run_id) or source.get("workflow_run_sha") != sha:
        return stage(FAIL, reason="R584_EVIDENCE_FOR_ANOTHER_R583_RUN")
    if document.get("side_effects") is not False:
        return stage(FAIL, reason="R584_SIDE_EFFECTS_NOT_FALSE")
    if document.get("decision") != R584_GREEN or document.get("blockers"):
        return stage(FAIL, reason="R584_DECISION_NOT_READY", decision=document.get("decision"),
                     blockers=list(document.get("blockers") or []))
    if document.get("attempt_9_authorized") or document.get("canonical_authorized"):
        return stage(FAIL, reason="R584_CLAIMS_AUTHORIZATION")
    return stage(PASS, decision=document.get("decision"))


def evaluate_transport(*, secrets_present: dict[str, bool], endpoint_matches: bool,
                       unauthenticated: dict[str, Any] | None,
                       authenticated: dict[str, Any] | None) -> dict[str, Any]:
    missing = sorted(k for k, ok in secrets_present.items() if not ok)
    if missing:
        return stage(FAIL, reason="SECRET_MISSING", missing=missing)
    if not endpoint_matches:
        return stage(FAIL, reason="ENDPOINT_NOT_APPROVED")
    for label, probe, want_status, want_error in (
        ("unauthenticated", unauthenticated, 401, "UNAUTHORIZED"),
        ("authenticated", authenticated, 400, "ATTESTATION_PAYLOAD_INVALID"),
    ):
        if probe is None or probe.get("status") is None:
            return stage(BLOCKED, reason="ENDPOINT_UNREACHABLE", probe=label)
        if probe["status"] == 503:
            return stage(FAIL, reason="SERVER_NOT_CONFIGURED", probe=label)
        if probe["status"] != want_status or probe.get("error") != want_error:
            return stage(FAIL, reason="TRANSPORT_UNEXPECTED_RESPONSE", probe=label,
                         observed={"status": probe["status"], "error": probe.get("error")})
    return stage(PASS, unauthenticated="401 UNAUTHORIZED", authenticated="400 ATTESTATION_PAYLOAD_INVALID",
                 attestation_submitted=False)


def evaluate_runtime(*, versions: dict[str, Any], healths: dict[str, Any], target_sha: str,
                     tree: Callable[[str], str | None], is_ancestor: Callable[[str, str], bool],
                     railway: dict[str, Any] | None) -> dict[str, Any]:
    for host in HOSTS:
        health = healths.get(host)
        if not isinstance(health, dict) or health.get("status") != "ok":
            return stage(BLOCKED, reason="HEALTH_NOT_OK", host=host)
        body = versions.get(host)
        if not isinstance(body, dict):
            return stage(BLOCKED, reason="VERSION_UNAVAILABLE", host=host)
    builds = [((versions[h].get("build") or {})) for h in HOSTS]
    commits = {b.get("commit") for b in builds}
    if len(commits) != 1:
        return stage(FAIL, reason="HOSTS_REPORT_DIFFERENT_BUILDS", observed=sorted(map(str, commits)))
    build = builds[0]
    commit = build.get("commit")
    if build.get("embedded") is not True or not isinstance(commit, str) or not SHA.match(commit):
        return stage(FAIL, reason="BUILD_IDENTITY_NOT_EMBEDDED")
    if build.get("source") not in ("railway", "build-arg"):
        return stage(FAIL, reason="BUILD_IDENTITY_SOURCE_UNKNOWN")
    if build.get("declared_revision_matches") is not True:
        return stage(FAIL, reason="DECLARED_REVISION_MISMATCH", build_commit=commit)
    # `declared_revision_matches` compares PARSER_BUILD_REVISION (or, without it,
    # PARSER_REVISION) with the embedded commit, so once a build revision is set
    # it says nothing about the semantic revision. That one is checked here,
    # against git, independently of what the worker reports about it: it must
    # name a commit of the target's history whose worker tree is the deployed one.
    parsers = [((versions[h].get("parser") or {})) for h in HOSTS]
    semantics = {str(p.get("semantic_revision")) for p in parsers}
    declared_builds = {str(p.get("build_revision")) for p in parsers}
    if len(semantics) != 1 or len(declared_builds) != 1:
        return stage(FAIL, reason="HOSTS_REPORT_DIFFERENT_REVISIONS", build_commit=commit)
    semantic, declared_build = semantics.pop(), declared_builds.pop()
    if declared_build != f"git:{commit}":
        return stage(FAIL, reason="BUILD_REVISION_NOT_EMBEDDED_COMMIT", build_commit=commit,
                     observed=declared_build)
    semantic_commit = semantic[4:] if semantic.startswith("git:") else ""
    if not SHA.match(semantic_commit):
        return stage(FAIL, reason="SEMANTIC_REVISION_INVALID", build_commit=commit, observed=semantic)
    if railway is None or railway.get("status") != "SUCCESS":
        failure = railway or {}
        return stage(BLOCKED, reason="RAILWAY_ACTIVE_DEPLOYMENT_UNVERIFIED", build_commit=commit,
                     error=failure.get("error"), observed=failure.get("messages") or failure.get("observed"))
    if railway.get("commitHash") != commit:
        return stage(FAIL, reason="RAILWAY_DEPLOYMENT_COMMIT_MISMATCH", build_commit=commit,
                     railway_commit=railway.get("commitHash"))
    if not is_ancestor(commit, target_sha):
        return stage(FAIL, reason="BUILD_COMMIT_NOT_ON_TARGET_HISTORY", build_commit=commit)
    built, target = tree(commit), tree(target_sha)
    if not built or built != target:
        return stage(FAIL, reason="WORKER_TREE_DIFFERS", build_commit=commit, build_tree=built, target_tree=target)
    if not is_ancestor(semantic_commit, target_sha):
        return stage(FAIL, reason="SEMANTIC_REVISION_NOT_ON_TARGET_HISTORY", build_commit=commit,
                     observed=semantic)
    if tree(semantic_commit) != built:
        return stage(FAIL, reason="SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD", build_commit=commit,
                     observed=semantic, semantic_tree=tree(semantic_commit), build_tree=built)
    return stage(PASS, build_commit=commit, worker_tree=built, railway_deployment=railway.get("id"),
                 semantic_revision=semantic,
                 note="identical worker tree; a rebuild would only relabel the image")


def decide(stages: dict[str, dict[str, Any]]) -> str:
    statuses = [s.get("status") for s in stages.values()]
    if not statuses or any(s not in (PASS, FAIL, BLOCKED, SKIPPED) for s in statuses):
        return FAIL
    if FAIL in statuses:
        return FAIL
    if all(s == PASS for s in statuses):
        return PASS
    return BLOCKED  # any BLOCKED or SKIPPED stage


# --------------------------------------------------------------------------- collection (I/O)


def _bytes_io(blob: bytes):
    import io
    return io.BytesIO(blob)


class Io:
    """All network and git access, so tests can replace it."""

    def __init__(self, token: str, root: Path):
        self.token, self.root = token, root

    def github(self, path: str) -> Any:
        req = urllib.request.Request(f"https://api.github.com/repos/{REPOSITORY}{path}", headers={
            "Accept": "application/vnd.github+json", "Authorization": f"Bearer {self.token}",
            "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "gamepro-h3e-activation-gate/1"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)

    def download(self, url: str) -> bytes:
        # curl drops the Authorization header on the cross-host redirect to blob storage.
        with tempfile.NamedTemporaryFile() as out:
            subprocess.run(["curl", "-fsSL", "--max-time", "60", "-H", f"Authorization: Bearer {self.token}",
                            "-o", out.name, url], check=True)
            return Path(out.name).read_bytes()

    def http(self, url: str, *, method: str = "GET", headers: dict[str, str] | None = None,
             data: bytes | None = None) -> dict[str, Any] | None:
        req = urllib.request.Request(url, data=data, method=method,
                                     headers={"User-Agent": "gamepro-h3e-activation-gate/1", **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                status, raw = response.status, response.read(65536)
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read(65536)
        except (urllib.error.URLError, TimeoutError, OSError):
            return None
        try:
            body = json.loads(raw)
        except ValueError:
            body = None
        return {"status": status, "body": body,
                "error": body.get("error") if isinstance(body, dict) else None}

    def railway_active(self, token: str) -> dict[str, Any]:
        """Newest SUCCESS deployment of the service, or {"error": ...} explaining why not."""
        query = ("query($input:DeploymentListInput!){deployments(input:$input,first:20)"
                 "{edges{node{id status createdAt meta}}}}")
        payload = json.dumps({"query": query, "variables": {"input": dict(RAILWAY)}})
        result = self.http(RAILWAY_API, method="POST", data=payload.encode(), headers={
            "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        if not result:
            return {"error": "RAILWAY_API_UNREACHABLE"}
        body = result.get("body") if isinstance(result.get("body"), dict) else {}
        if result["status"] != 200 or body.get("errors"):
            messages = [str((e or {}).get("message", ""))[:160] for e in (body.get("errors") or [])][:3]
            return {"error": f"RAILWAY_API_HTTP_{result['status']}", "messages": messages}
        edges = (((body.get("data") or {}).get("deployments") or {}).get("edges") or [])
        nodes = [e.get("node") or {} for e in edges if isinstance(e, dict)]
        live = sorted((n for n in nodes if n.get("status") == "SUCCESS"),
                      key=lambda n: str(n.get("createdAt") or ""), reverse=True)
        if not live:
            return {"error": "RAILWAY_NO_SUCCESS_DEPLOYMENT", "observed": len(nodes)}
        node = live[0]
        meta = node.get("meta") if isinstance(node.get("meta"), dict) else {}
        return {"id": node.get("id"), "status": node.get("status"),
                "commitHash": meta.get("commitHash") or meta.get("commit"), "branch": meta.get("branch")}

    def git(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(["git", *args], cwd=self.root, capture_output=True, text=True)

    def tree(self, commit: str) -> str | None:
        out = self.git("rev-parse", f"{commit}:{WORKER_DIR}")
        return out.stdout.strip() if out.returncode == 0 else None

    def is_ancestor(self, older: str, newer: str) -> bool:
        return self.git("merge-base", "--is-ancestor", older, newer).returncode == 0


def find_artifact(io: Io, name: str) -> tuple[dict[str, Any] | None, bytes | None]:
    listed = io.github(f"/actions/artifacts?name={name}&per_page=10").get("artifacts") or []
    exact = [a for a in listed if a.get("name") == name and not a.get("expired")]
    if len(exact) != 1:
        return None, None
    return exact[0], io.download(exact[0]["archive_download_url"])


def collect_prerequisites(io: Io, sha: str) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    runs: dict[str, dict[str, Any] | None] = {}
    for key, (path, name, event) in WORKFLOWS.items():
        listed = io.github(f"/actions/workflows/{path}/runs?head_sha={sha}&per_page=50").get("workflow_runs") or []
        runs[key] = latest_run(listed, sha=sha, event=event)
        out[key] = evaluate_run(runs[key], name=name)
    if out["quality_gates"]["status"] == PASS:
        jobs = io.github(f"/actions/runs/{runs['quality_gates']['id']}/jobs?filter=latest&per_page=100").get("jobs") or []
        out["main_required_gates"] = evaluate_job(jobs, job_name="Main required gates")
    else:
        out["main_required_gates"] = stage(SKIPPED, reason="QUALITY_GATES_NOT_PASS")
    if evaluate_producer(runs["r5_8_3"], name=WORKFLOWS["r5_8_3"][1])["status"] == PASS:
        run_id = runs["r5_8_3"]["id"]
        meta, blob = find_artifact(io, f"r5-8-3-preflight-{sha}-{run_id}")
        integrity, document = evaluate_artifact(meta, blob, run_id=run_id, expected_name=f"r5-8-3-preflight-{sha}-{run_id}")
        out["r5_8_3_artifact"] = integrity
        out["r5_8_3_decision"] = evaluate_r583(document, sha=sha) if document is not None else stage(SKIPPED, reason="NO_ARTIFACT")
        name = f"r5-8-4-gate-reconciliation-{run_id}-{sha}"
        meta, blob = find_artifact(io, name)
        producer = (meta or {}).get("workflow_run") or {}
        integrity, document = evaluate_artifact(meta, blob, run_id=producer.get("id"), expected_name=name)
        if meta is not None and integrity["status"] == PASS:
            try:
                producer_run = io.github(f"/actions/runs/{producer.get('id')}")
            except Exception:
                producer_run = None
            check = evaluate_producer(producer_run, name=WORKFLOWS["r5_8_4"][1])
            integrity = integrity if check["status"] == PASS else check
        out["r5_8_4_artifact"] = integrity
        out["r5_8_4_decision"] = (evaluate_r584(document, r583_run_id=run_id, sha=sha)
                                  if document is not None and integrity["status"] == PASS
                                  else stage(SKIPPED, reason="NO_VALID_ARTIFACT"))
    else:
        for key in ("r5_8_3_artifact", "r5_8_3_decision", "r5_8_4_artifact", "r5_8_4_decision"):
            out[key] = stage(SKIPPED, reason="R583_RUN_NOT_FINISHED")
    return out


def collect_transport(io: Io, env: dict[str, str]) -> dict[str, Any]:
    endpoint = env.get("PARSER_ATTESTATION_ENDPOINT", "")
    transport = env.get("PARSER_ATTESTATION_TRANSPORT_SECRET", "")
    present = {name: bool(env.get(name)) for name in (
        "PARSER_ATTESTATION_ENDPOINT", "PARSER_ATTESTATION_TRANSPORT_SECRET",
        "PARSER_ATTESTATION_HMAC_SECRET", "RAILWAY_API_TOKEN")}
    if not all(present.values()) or endpoint != ATTESTATION_ENDPOINT:
        return evaluate_transport(secrets_present=present, endpoint_matches=endpoint == ATTESTATION_ENDPOINT,
                                  unauthenticated=None, authenticated=None)
    unauth = io.http(endpoint, method="POST", data=b"{}", headers={"Content-Type": "application/json"})
    auth = io.http(endpoint, method="POST", data=b"{}", headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {transport}",
        "X-Parser-Attestation-Transport": transport})
    return evaluate_transport(secrets_present=present, endpoint_matches=True,
                              unauthenticated=unauth, authenticated=auth)


def collect_runtime(io: Io, env: dict[str, str], sha: str) -> dict[str, Any]:
    versions: dict[str, Any] = {}
    healths: dict[str, Any] = {}
    for host in HOSTS:
        version, health = io.http(f"{host}/version"), io.http(f"{host}/health")
        versions[host] = version["body"] if version and version["status"] == 200 else None
        healths[host] = health["body"] if health and health["status"] == 200 else None
    token = env.get("RAILWAY_API_TOKEN", "")
    railway = io.railway_active(token) if token else None
    result = evaluate_runtime(versions=versions, healths=healths, target_sha=sha, tree=io.tree,
                              is_ancestor=io.is_ancestor, railway=railway)
    result["observed_build"] = {h: (versions[h] or {}).get("build") for h in HOSTS}
    return result


def run_gate(io: Io, env: dict[str, str], *, target_sha: str, main_head: str | None) -> dict[str, Any]:
    stages: dict[str, dict[str, Any]] = {}
    if not SHA.match(target_sha or ""):
        stages["target"] = stage(FAIL, reason="TARGET_SHA_INVALID")
    elif main_head != target_sha:
        stages["target"] = stage(BLOCKED, reason="TARGET_IS_NOT_CURRENT_MAIN_HEAD", main_head=main_head)
    else:
        stages["target"] = stage(PASS)
    def guarded(name: str, collect: Callable[[], dict[str, Any]]) -> dict[str, Any]:
        # An API error is missing evidence, never a pass and never a crash without a record.
        try:
            return collect()
        except Exception as exc:  # noqa: BLE001
            return {name: stage(BLOCKED, reason="COLLECTION_ERROR", error=type(exc).__name__)}

    if stages["target"]["status"] == PASS:
        stages.update(guarded("prerequisites", lambda: collect_prerequisites(io, target_sha)))
    stages.update(guarded("transport", lambda: {"transport": collect_transport(io, env)}))
    if stages["target"]["status"] == PASS:
        stages.update(guarded("runtime", lambda: {"runtime": collect_runtime(io, env, target_sha)}))
    else:
        stages["runtime"] = stage(SKIPPED, reason="TARGET_NOT_PASS")
    return {
        "schema_version": 1,
        "operation": "H3E_ACTIVATION_GATE",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "target_sha": target_sha,
        "trigger": {"event": env.get("GITHUB_EVENT_NAME"), "run_id": env.get("GITHUB_RUN_ID"),
                    "run_attempt": env.get("GITHUB_RUN_ATTEMPT"), "ref": env.get("GITHUB_REF")},
        "stages": stages,
        "decision": decide(stages),
        "side_effects": dict(SIDE_EFFECTS),
        "authorizes": {"attempt_9": False, "canonical": False, "real_dem": False},
    }


def render(evidence: dict[str, Any]) -> str:
    lines = [f"## H.3-E activation gate: {evidence['decision']}", "",
             f"Target `{evidence['target_sha']}`. SKIPPED is never evidence.", "",
             "| Stage | Status | Reason |", "| --- | --- | --- |"]
    for name, value in evidence["stages"].items():
        lines.append(f"| `{name}` | {value['status']} | {value.get('reason', '')} |")
    lines += ["", "Side effects: " + ", ".join(f"{k}={v}" for k, v in evidence["side_effects"].items())]
    return "\n".join(lines) + "\n"


SAFE_DETAIL_KEYS = ("reason", "observed", "decision", "failures", "blockers", "missing", "probe",
                    "build_commit", "railway_commit", "main_head", "expected_name", "error")


def _escape(text: str) -> str:
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def annotations(evidence: dict[str, Any]) -> list[str]:
    """Workflow commands that surface the decision as check annotations.

    The evidence artifact holds everything; annotations repeat the decision and
    the reason of each stage that did not pass, from an allow-list of fields
    that can never contain a secret value.
    """
    stages = evidence["stages"]
    overview = ", ".join(f"{name}={value['status']}" for name, value in stages.items())
    lines = ["::notice title=H.3-E activation gate::"
             + _escape(f"decision={evidence['decision']} target={evidence['target_sha']} {overview}")]
    for name, value in stages.items():
        if value["status"] == PASS:
            continue
        details = {k: value[k] for k in SAFE_DETAIL_KEYS if k in value}
        level = "error" if value["status"] == FAIL else "warning"
        lines.append(f"::{level} title=H.3-E stage {name}::"
                     + _escape(f"{value['status']} " + json.dumps(details, sort_keys=True)))
    return lines[:20]


def main() -> int:
    env = dict(os.environ)
    root = Path(__file__).resolve().parents[2]
    io = Io(env.get("GITHUB_TOKEN", ""), root)
    target = env.get("H3E_TARGET_SHA", "")
    try:
        main_head = io.github("/branches/main")["commit"]["sha"]
    except Exception:
        main_head = None
    if env.get("GITHUB_REPOSITORY") != REPOSITORY:
        evidence = run_gate(io, env, target_sha="", main_head=main_head)
    else:
        evidence = run_gate(io, env, target_sha=target, main_head=main_head)
    out = Path(env.get("H3E_EVIDENCE_OUT", "h3e-activation-gate.json"))
    out.write_text(json.dumps(evidence, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    text = render(evidence)
    print(text)
    for line in annotations(evidence):
        print(line)
    summary = env.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(text)
    return 0 if evidence["decision"] == PASS else 1


if __name__ == "__main__":
    raise SystemExit(main())
