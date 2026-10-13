#!/usr/bin/env python3
"""Bind the A9.1 real-DEM laboratory run to a pre-DEM approval, then reconcile
its results into the post-DEM gates.

Two commands, both read-only towards production:

  precondition  run before anything is downloaded or built. The operator names
                the H.3-E activation run that approved this commit. It must be
                the newest completed activation run, for the exact commit that
                is the current head of main, finished successfully with
                decision PASS and predem_decision READY_FOR_PREDEM_REVIEW,
                authorize only the laboratory dispatch, and be at most
                MAX_APPROVAL_AGE_SECONDS old. Its evidence artifact is checked
                for digest and content. Anything else stops the workflow.

  postdem       run after the laboratory job, from its sealed public reports.
                Maps them into the four post-DEM gates of the R5.8.4 matrix,
                bound to the approval; exits non-zero unless all are VERIFIED.

Neither command dispatches a workflow, writes provenance, touches Railway or the
managed database, or authorizes production, Attempt 9 or Canonical.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r5_8_4_gate_reconciliation import POST_DEM_GATES, reconcile_gates  # noqa: E402

REPOSITORY = "GameProAcademy/cs2-pro-hub"
ACTIVATION_WORKFLOW = "h3-e-activation-gate.yml"
ACTIVATION_NAME = "H.3-E Activation Gate"
PREDEM_READY = "READY_FOR_PREDEM_REVIEW"
MAX_APPROVAL_AGE_SECONDS = 6 * 3600
DEM_SHA256 = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d"
DEM_SIZE = 473748061
TICK_DOMAINS = ("playback_ticks", "tick_properties")
HOSTS = ("https://parser.gamepro.network", "https://cs2-demo-parser-production.up.railway.app")


def _ts(value: Any) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def evaluate_approval(*, approval_run_id: str, sha: str, main_head: str | None, ref: str,
                      run: dict[str, Any] | None, newest_completed_id: Any,
                      artifacts: list[dict[str, Any]], blob: bytes | None, now: float,
                      live_versions: dict[str, Any] | None = None) -> dict[str, Any]:
    """Pure check of the cited pre-DEM approval. Returns {ok, reason, approval}."""
    def refuse(reason: str, **detail: Any) -> dict[str, Any]:
        return {"ok": False, "reason": reason, **detail}

    if ref != "refs/heads/main" or not isinstance(sha, str) or len(sha) != 40:
        return refuse("NOT_MAIN")
    if main_head != sha:
        return refuse("COMMIT_IS_NOT_MAIN_HEAD", main_head=main_head)
    if not str(approval_run_id).isdigit():
        return refuse("APPROVAL_RUN_ID_INVALID")
    if not isinstance(run, dict) or str(run.get("id")) != str(approval_run_id):
        return refuse("APPROVAL_RUN_NOT_FOUND")
    if (run.get("name") != ACTIVATION_NAME or (run.get("repository") or {}).get("full_name") != REPOSITORY
            or run.get("head_branch") != "main"):
        return refuse("APPROVAL_IS_NOT_AN_ACTIVATION_RUN_OF_MAIN")
    if run.get("status") != "completed" or run.get("conclusion") != "success":
        return refuse("APPROVAL_RUN_NOT_SUCCESS", observed=run.get("conclusion") or run.get("status"))
    if str(newest_completed_id) != str(approval_run_id):
        return refuse("APPROVAL_SUPERSEDED", newest=newest_completed_id)
    finished = _ts(run.get("updated_at"))
    if finished is None or finished > now or now - finished > MAX_APPROVAL_AGE_SECONDS:
        return refuse("APPROVAL_STALE_OR_IN_THE_FUTURE")
    prefix = f"h3e-activation-gate-{sha}-{approval_run_id}-"
    candidates = [a for a in artifacts if str(a.get("name", "")).startswith(prefix) and not a.get("expired")]
    if len(candidates) != 1 or blob is None:
        return refuse("APPROVAL_EVIDENCE_NOT_FOUND")
    if candidates[0].get("digest") != "sha256:" + hashlib.sha256(blob).hexdigest():
        return refuse("APPROVAL_EVIDENCE_DIGEST_MISMATCH")
    try:
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            if archive.namelist() != ["h3e-activation-gate.json"]:
                return refuse("APPROVAL_EVIDENCE_CONTENT_UNEXPECTED")
            evidence = json.loads(archive.read("h3e-activation-gate.json"))
    except (zipfile.BadZipFile, ValueError, KeyError):
        return refuse("APPROVAL_EVIDENCE_UNREADABLE")
    authorizes = evidence.get("authorizes") if isinstance(evidence.get("authorizes"), dict) else {}
    if (evidence.get("target_sha") != sha or evidence.get("decision") != "PASS"
            or evidence.get("predem_decision") != PREDEM_READY
            or ((evidence.get("stages") or {}).get("predem_matrix") or {}).get("status") != "PASS"):
        return refuse("APPROVAL_EVIDENCE_NOT_PREDEM_READY", decision=evidence.get("decision"),
                      predem_decision=evidence.get("predem_decision"))
    if (authorizes.get("real_dem_laboratory_dispatch") is not True or authorizes.get("real_dem_production") is not False
            or authorizes.get("attempt_9") is not False or authorizes.get("canonical") is not False):
        return refuse("APPROVAL_AUTHORIZES_SOMETHING_ELSE")
    # The runtime approved then must still be the runtime serving now: a
    # redeploy between approval and dispatch voids the approval.
    runtime = (evidence.get("stages") or {}).get("runtime") or {}
    approved = {"build_commit": runtime.get("build_commit"), "semantic_revision": runtime.get("semantic_revision")}
    if runtime.get("status") != "PASS" or not all(isinstance(v, str) and v for v in approved.values()):
        return refuse("APPROVAL_RUNTIME_IDENTITY_MISSING")
    live = live_versions if isinstance(live_versions, dict) else {}
    for host in HOSTS:
        body = live.get(host)
        if not isinstance(body, dict):
            return refuse("LIVE_RUNTIME_UNAVAILABLE", observed=host)
        build = body.get("build") if isinstance(body.get("build"), dict) else {}
        parser = body.get("parser") if isinstance(body.get("parser"), dict) else {}
        if (build.get("commit") != approved["build_commit"] or build.get("declared_revision_matches") is not True
                or parser.get("semantic_revision") != approved["semantic_revision"]):
            return refuse("LIVE_RUNTIME_DIFFERS_FROM_APPROVED", observed=host)
    return {"ok": True, "reason": None,
            "approval": {"run_id": str(approval_run_id), "sha": sha, "finished_at": run.get("updated_at"),
                         "artifact_digest": candidates[0].get("digest"), "runtime": approved}}


def _status(ok: bool, ref: str) -> dict[str, str]:
    return {"status": "VERIFIED" if ok else "NOT_PROVEN", "evidence_ref": ref}


def postdem_evidence(report: Any, parity: Any, determinism: Any) -> dict[str, dict[str, str]]:
    """Map the sealed A9.1 reports into the four post-DEM gates. Absent -> NOT_PROVEN."""
    report = report if isinstance(report, dict) else {}
    parity = parity if isinstance(parity, dict) else {}
    determinism = determinism if isinstance(determinism, dict) else {}
    fixture = report.get("fixture") if isinstance(report.get("fixture"), dict) else {}
    locks_ok = all(report.get(k) is False for k in ("canonicalAuthorization", "attempt9Authorization",
                                                     "productionAuthorization", "canonicalEligible"))
    demo_ok = fixture.get("sha256") == DEM_SHA256 and fixture.get("sizeBytes") == DEM_SIZE
    sealed = report.get("status") == "PASS" and report.get("test_fixture_only") is False and locks_ok and demo_ok

    diagnostics = parity.get("field_diagnostics") if isinstance(parity.get("field_diagnostics"), dict) else {}
    field_count = diagnostics.get("field_count")
    parity_ok = (sealed and parity.get("status") == "PASS" and parity.get("comparableFailCount") == 0
                 and parity.get("blockedCount") == 0 and parity.get("notRunCount") == 0
                 and isinstance(field_count, int) and field_count > 0
                 and diagnostics.get("field_pass_count") == field_count
                 and diagnostics.get("first_divergence") is None)

    runs = report.get("runs") if isinstance(report.get("runs"), dict) else {}

    def stable(runtime: str) -> bool:
        items = runs.get(runtime)
        if not isinstance(items, list) or len(items) != 2:
            return False
        digests = {i.get("normalizedDigest") for i in items if isinstance(i, dict) and i.get("status") == "SUCCEEDED"}
        return len(digests) == 1 and all(isinstance(d, str) and len(d) == 64 for d in digests) and \
            sum(1 for i in items if isinstance(i, dict) and i.get("status") == "SUCCEEDED") == 2

    determinism_ok = (sealed and determinism.get("status") == "PASS" and determinism.get("pythonDeterministic") is True
                      and determinism.get("wasmDeterministic") is True and stable("python") and stable("wasm"))
    comparisons = {str(c.get("field")): c.get("status") for c in (parity.get("comparisons") or []) if isinstance(c, dict)}
    tick_ok = sealed and parity_ok and all(comparisons.get(d) == "PASS" for d in TICK_DOMAINS)
    wasm = report.get("wasmArtifact") if isinstance(report.get("wasmArtifact"), dict) else {}
    parser = report.get("parser") if isinstance(report.get("parser"), dict) else {}
    frozen_ok = (sealed and determinism.get("identityStable") is True
                 and isinstance(wasm.get("artifactIdentity"), str) and len(wasm["artifactIdentity"]) == 64
                 and parser.get("version") == "0.42.0" and isinstance(parser.get("revision"), str))
    return {
        "python_wasm_parity": _status(parity_ok, "a91.parity_report"),
        "determinism": _status(determinism_ok, "a91.determinism_report+runs"),
        "tick_authority": _status(tick_ok, "a91.parity_report.comparisons"),
        "runtime_frozen": _status(frozen_ok, "a91.determinism.identityStable+wasmArtifact"),
    }


def reconcile_postdem(approval: dict[str, Any] | None, report: Any, parity: Any, determinism: Any) -> dict[str, Any]:
    matrix = reconcile_gates(postdem_evidence(report, parity, determinism), predem_approval=approval)
    return {
        "schema_version": 1,
        "operation": "A91_POSTDEM_RECONCILIATION",
        "side_effects": False,
        "predem_approval": approval,
        "post_dem": matrix["phases"]["post_dem"],
        "gates": {g: matrix["gates"][g] for g in POST_DEM_GATES},
        "postdem_decision": matrix["postdem_decision"],
        "authorizes": {"production": False, "attempt_9": False, "canonical": False},
    }


# ----------------------------------------------------------------------------- io


class Github:
    def __init__(self, token: str):
        self.token = token

    def request(self, path: str) -> bytes:
        url = path if path.startswith("https://") else f"https://api.github.com/repos/{REPOSITORY}{path}"
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                                   "Authorization": f"Bearer {self.token}",
                                                   "User-Agent": "gamepro-a91-predem/1"})
        with urllib.request.urlopen(req, timeout=60) as response:  # noqa: S310 - GitHub API only
            return response.read()

    def json(self, path: str) -> Any:
        return json.loads(self.request(path))


def _escape(text: str) -> str:
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def precondition(env: dict[str, str], gh: Github, now: Callable[[], float]) -> int:
    run_id = env.get("PREDEM_APPROVAL_RUN_ID", "").strip()
    sha = env.get("GITHUB_SHA", "")
    try:
        main_head = gh.json("/branches/main")["commit"]["sha"]
        run = gh.json(f"/actions/runs/{run_id}") if run_id.isdigit() else None
        listed = gh.json(f"/actions/workflows/{ACTIVATION_WORKFLOW}/runs?status=completed&per_page=1")
        newest = ((listed.get("workflow_runs") or [{}])[0]).get("id")
        artifacts = (gh.json(f"/actions/runs/{run_id}/artifacts?per_page=100").get("artifacts") or []) if run else []
        prefix = f"h3e-activation-gate-{sha}-{run_id}-"
        chosen = [a for a in artifacts if str(a.get("name", "")).startswith(prefix) and not a.get("expired")]
        blob = gh.request(chosen[0]["archive_download_url"]) if len(chosen) == 1 else None
        live: dict[str, Any] = {}
        for host in HOSTS:
            try:
                req = urllib.request.Request(host + "/version", headers={"User-Agent": "gamepro-a91-predem/1"})
                with urllib.request.urlopen(req, timeout=20) as response:  # noqa: S310 - pinned worker hosts
                    live[host] = json.load(response)
            except Exception:  # noqa: BLE001 - unavailable is a refusal
                live[host] = None
        result = evaluate_approval(approval_run_id=run_id, sha=sha, main_head=main_head, ref=env.get("GITHUB_REF", ""),
                                   run=run, newest_completed_id=newest, artifacts=artifacts, blob=blob, now=now(),
                                   live_versions=live)
    except Exception as exc:  # noqa: BLE001 - missing evidence is a refusal, never a pass
        result = {"ok": False, "reason": "APPROVAL_COLLECTION_ERROR", "error": type(exc).__name__}
    Path(env.get("A91_PREDEM_OUT", "a91-predem-approval.json")).write_text(json.dumps(result, sort_keys=True) + "\n")
    level = "notice" if result["ok"] else "error"
    print(f"::{level} title=A91 pre-DEM approval::" + _escape(json.dumps(
        {k: result.get(k) for k in ("ok", "reason", "approval", "main_head", "observed", "decision", "predem_decision")},
        sort_keys=True)))
    if result["ok"] and env.get("GITHUB_OUTPUT"):
        with open(env["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write(f"approval_run_id={result['approval']['run_id']}\n")
    return 0 if result["ok"] else 1


def postdem(env: dict[str, str]) -> int:
    approval_doc = json.loads(Path(env["A91_PREDEM_FILE"]).read_text())
    approval = approval_doc.get("approval") if approval_doc.get("ok") is True else None
    reports = Path(env["A91_REPORTS_DIR"])

    def load(name: str) -> Any:
        path = reports / name
        return json.loads(path.read_text()) if path.is_file() else None

    result = reconcile_postdem(approval, load("a91_real_dem_report.json"), load("parity_report.json"),
                               load("determinism_report.json"))
    Path(env.get("A91_POSTDEM_OUT", "a91-postdem-reconciliation.json")).write_text(
        json.dumps(result, sort_keys=True, indent=2) + "\n")
    ok = result["postdem_decision"] == "VERIFIED"
    print(f"::{'notice' if ok else 'error'} title=A91 post-DEM decision::" + _escape(json.dumps(
        {"postdem_decision": result["postdem_decision"], "blockers": result["post_dem"]["blockers"],
         "predem_approval_run_id": (approval or {}).get("run_id")}, sort_keys=True)))
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    env = dict(os.environ)
    if argv[1:] == ["precondition"]:
        return precondition(env, Github(env.get("GITHUB_TOKEN", "")), lambda: datetime.now(timezone.utc).timestamp())
    if argv[1:] == ["postdem"]:
        return postdem(env)
    print("usage: a91_predem_postdem.py precondition|postdem", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
