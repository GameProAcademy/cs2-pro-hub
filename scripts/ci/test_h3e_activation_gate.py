"""The H.3-E activation gate passes only on complete, current, positive evidence.

Every network and git call goes through a fake, so these tests are offline and
exercise the same `run_gate` the workflow runs.
"""
import copy
import hashlib
import importlib.util
import io
import json
import unittest
import zipfile
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("h3e_activation_gate", Path(__file__).with_name("h3e_activation_gate.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
spec = importlib.util.spec_from_file_location(
    "r5_8_4_gate_reconciliation", Path(__file__).resolve().parents[1] / "r5_8_4_gate_reconciliation.py")
r584 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r584)


def r584_document(r583_id, *, verified_pre=None):
    """A real R5.8.4 matrix (schema 2) built by the reconciler itself.

    By default every pre-DEM gate collected outside this activation gate is
    VERIFIED: the world in which each collector delivered. Tests remove gates
    to model what is actually missing. Post-DEM gates are never set.
    """
    own = {g for g in r584.PRE_DEM_GATES if g not in gate.ACTIVATION_COLLECTED}
    chosen = own if verified_pre is None else set(verified_pre)
    doc = r584.reconcile_gates({g: {"status": "VERIFIED", "evidence_ref": f"test:{g}"} for g in chosen})
    doc["source"] = {"workflow_run_id": str(r583_id), "workflow_run_sha": TARGET}
    in_scope = [g for g in r584.PRE_DEM_GATES if r584.GATE_SPECS[g][1] == r584.R583]
    doc["own_scope"] = {"gates": in_scope, "blockers": [g for g in in_scope if g not in chosen]}
    return doc


def queue_annotations(job):
    probes = {gate.QUEUE_JOBS[0]: ("DEMO_PARSE_QUEUE_SEMANTICS", "DEMO_PARSE_RECOVERY_PROTOCOL",
                                   "CANONICAL_PERSISTENCE_IDEMPOTENCY", "ATTESTATION_RECORDER_RECONCILIATION"),
              gate.QUEUE_JOBS[1]: ("DEMO_PARSE_RECOVERY_END_TO_END",)}[job]
    return [{"title": "Queue probe", "message": json.dumps(
        {"probe": name, "status": "PASS", "passed": 7, "total": 7, "not_passed": [], "known_defects": []})}
        for name in probes] + [{"title": "Queue probe passed scenarios", "message": "{}"}]

TARGET = "7e6eb4639bb90ceb8ad3c167f27069475a6d5672"
BUILD = "10815fb44e165963adfaf07f71c474ca628f4b7f"
TREE = "8120c12a0db34bb4f187ac628ba7c5ea9b03cecf"
REPO = {"full_name": gate.REPOSITORY}
SECRETS = {
    "PARSER_ATTESTATION_ENDPOINT": gate.ATTESTATION_ENDPOINT,
    "PARSER_ATTESTATION_TRANSPORT_SECRET": "t" * 48,
    "PARSER_ATTESTATION_HMAC_SECRET": "h" * 48,
    "RAILWAY_API_TOKEN": "r" * 40,
    "GITHUB_EVENT_NAME": "workflow_run",
}


def zipped(name: str, document: dict) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(name, json.dumps(document))
    return buffer.getvalue()


def run(run_id, path_key, *, conclusion="success", status="completed", sha=TARGET, attempt=1, number=None):
    _, name, event = gate.WORKFLOWS[path_key]
    return {"id": run_id, "name": name, "event": event, "head_sha": sha, "head_branch": "main",
            "repository": REPO, "status": status, "conclusion": conclusion, "run_attempt": attempt,
            "run_number": number or run_id, "html_url": f"https://example.invalid/runs/{run_id}"}


def snapshot_world_pins():
    hashes = {f"services/cs2-demo-parser/{n}": n[0] * 40 for n in ("parser.py", "adapter.py", "worker.py")}
    return {"recorder_md5": "d" * 32, "runtime": {
        "deployment_id": "09b50029-2508-4267-bb1d-28c5e99b95db", "project_id": "p", "service_id": "s",
        "environment_id": "e", "branch": "main", "semantic_commit": BUILD, "build_commit": BUILD,
        "deployment_created_at": "2026-10-13T08:27:16.178Z", "workflow_source_sha": "f" * 40,
        "workflow_ref": "GameProAcademy/cs2-pro-hub/.github/workflows/parser-runtime-attestation.yml@refs/heads/main",
        "critical_hashes": hashes}}


def green_snapshot(pins):
    """A snapshot in which every database and fresh-attestation gate is VERIFIED."""
    import sys
    sys.path.insert(0, str(Path(gate.__file__).resolve().parents[1] / "predem"))
    import managed_snapshot as ms
    rt = pins["runtime"]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    return {
        "schema_version": ms.SCHEMA_VERSION, "snapshot_at": now, "digest": "a" * 64,
        "database": {"recorder_md5": pins["recorder_md5"], "migration_head": "20261013130000"},
        "mapping_release": {"authoritative_releases": 1, "authorized_counts": [0], "generic_counts": [0],
                            "inventory_digests": [ms.INVENTORY_DIGEST], "inventory_rows": 105,
                            "matrix_digests": [ms.MATRIX_DIGEST], "row_counts": [105]},
        "attempts": {"jobs_attempt_9_or_more": 0, "max_attempt_number": 8, "jobs_attempt_9_or_more_authorized": 0,
                     "forensic_replays_attempt_9_or_more": 0, "authorization_rows": 0,
                     "authorization_rows_not_matching_job": 0},
        "derived_rows": {"match_metrics": 0, "match_features": 0, "match_metrics_with_verified_lineage": 0,
                         "match_features_with_verified_lineage": 0},
        "canonical": {"first_verified_provenance_at": "2026-10-05T00:00:00Z", "matches_by_status": {},
                      "matches_with_status": 0, "matches_created_before_first_verified_provenance": 0,
                      "unquarantined_with_status_and_verified_lineage": 0,
                      "quarantine": {"quarantined_matches": 0, "quarantined_with_status": 0,
                                     "unquarantined_with_status": 0,
                                     "unquarantined_created_before_first_verified_provenance": 0,
                                     "quarantined_completed": 0, "quarantined_derived_rows": 0,
                                     "guards": {g: True for g in ms.QUARANTINE_GUARDS}}},
        "execution_identity": {"conflicting_executions": 0, "ledger_rows": 0},
        "retention": {"deletion_failed": 0, "deletion_metadata_mismatch": 0, "expired_demos": 0},
        "provenance": {"verified_rows": 1, "latest": [{
            "created_at": "2026-10-13T09:00:00.000000Z", "deployment_id": rt["deployment_id"],
            "railway_project_id": rt["project_id"], "railway_service_id": rt["service_id"],
            "railway_environment_id": rt["environment_id"], "railway_branch": rt["branch"],
            "git_commit": rt["semantic_commit"], "deployment_source_commit": rt["build_commit"],
            "deployment_status": "SUCCESS", "semantic_revision": f"git:{rt['semantic_commit']}",
            "build_revision": f"git:{rt['build_commit']}", "verification_method": ms.VERIFICATION_METHOD,
            "attestation_version": 3, "signature_is_hmac_sha256_hex": True,
            "attestor_provider": "github_actions_oidc", "workflow_event": "workflow_dispatch",
            "workflow_ref": rt["workflow_ref"], "workflow_source_sha": rt["workflow_source_sha"],
            "workflow_run_id": "1",
            "critical_hashes": {p: {"observed": b, "match": True} for p, b in rt["critical_hashes"].items()}}]},
    }


class World:
    """A complete, green state of GitHub, the endpoints, Railway and git."""

    def __init__(self):
        self.runs = {key: [run(100 + i, key)] for i, key in enumerate(gate.WORKFLOWS)}
        self.jobs = [{"id": 1, "name": "Main required gates", "conclusion": "success"},
                     {"id": 2, "name": "CS2 parser tests", "conclusion": "skipped"}]
        r583_id = self.runs["r5_8_3"][0]["id"]
        r584_id = self.runs["r5_8_4"][0]["id"]
        self.r583_doc = {"github": {"sha": TARGET}, "side_effects": False,
                         "decision": gate.R583_GREEN, "failures": []}
        self.r584_doc = r584_document(r583_id)
        self.queue_jobs = [{"id": 31, "name": gate.QUEUE_JOBS[0]}, {"id": 32, "name": gate.QUEUE_JOBS[1]}]
        self.queue_annotations = {31: queue_annotations(gate.QUEUE_JOBS[0]), 32: queue_annotations(gate.QUEUE_JOBS[1])}
        self.artifacts = {
            f"r5-8-3-preflight-{TARGET}-{r583_id}-attempt-1": (r583_id, "r5-8-3-preflight.json", "r583_doc"),
            f"r5-8-4-gate-reconciliation-{r583_id}-attempt-1-{TARGET}": (r584_id, "r5-8-4-gate-reconciliation.json", "r584_doc"),
        }
        self.digest_override = {}
        self.version = {"parser": {"name": "demoparser2", "version": "0.42.0", "revision": f"git:{BUILD}",
                                   "semantic_revision": f"git:{BUILD}",
                                   "build_revision": f"git:{BUILD}"}, "contract_version": 1,
                        "build": {"commit": BUILD, "embedded": True, "source": "railway",
                                  "declared_revision_matches": True}}
        self.version_by_host = {}
        self.health = {"status": "ok"}
        self.fingerprint = {"status": "VERIFIED_SOURCE_FINGERPRINT",
                            "bridge": {"expectedWorkerBuildCommit": BUILD, "configured": True, "enforced": True},
                            "parserLock": {"name": "demoparser2", "version": "0.42.0", "revision": f"git:{BUILD}",
                                           "buildRevision": f"git:{BUILD}", "revisionRequired": True,
                                           "buildRevisionRequired": True, "contractVersion": 1,
                                           "revisionSource": "code", "buildRevisionSource": "code"}}
        self.endpoint_down = set()
        self.transport = {"unauth": (401, "UNAUTHORIZED"), "auth": (400, "ATTESTATION_PAYLOAD_INVALID")}
        self.railway = {"id": "3ad4b1fe-9b9e-4fec-b79a-4215d27aab29", "status": "SUCCESS",
                        "commitHash": BUILD, "branch": "main"}
        self.pins = snapshot_world_pins()
        self.snapshot_response = {"status": 200, "body": {"snapshot": green_snapshot(self.pins)}, "error": None}
        self.trees = {BUILD: TREE, TARGET: TREE}
        self.ancestors = {(BUILD, TARGET), (TARGET, TARGET)}
        self.main_head = TARGET


class FakeIo:
    def __init__(self, world: World):
        self.w = world
        self.calls = []

    def blob(self, name):
        _, member, attr = self.w.artifacts[name]
        return zipped(member, getattr(self.w, attr))

    def github(self, path):
        self.calls.append(("GET", path))
        w = self.w
        if path.startswith("/actions/workflows/"):
            workflow = path.split("/")[3]
            key = next(k for k, (p, _, _) in gate.WORKFLOWS.items() if p == workflow)
            return {"workflow_runs": copy.deepcopy(w.runs[key])}
        if path.endswith("/jobs?filter=latest&per_page=100"):
            run_id = int(path.split("/")[3])
            if any(r["id"] == run_id for r in w.runs["queue_semantics"]):
                return {"jobs": copy.deepcopy(w.queue_jobs)}
            return {"jobs": copy.deepcopy(w.jobs)}
        if path.startswith("/check-runs/") and "/annotations" in path:
            return copy.deepcopy(w.queue_annotations[int(path.split("/")[2])])
        if path.startswith("/actions/artifacts?name="):
            name = path.split("name=")[1].split("&")[0]
            if name not in w.artifacts:
                return {"artifacts": []}
            run_id = w.artifacts[name][0]
            digest = w.digest_override.get(name, "sha256:" + hashlib.sha256(self.blob(name)).hexdigest())
            return {"artifacts": [{"id": 9, "name": name, "expired": False, "digest": digest,
                                   "workflow_run": {"id": run_id}, "archive_download_url": f"zip://{name}"}]}
        if path.startswith("/actions/runs/"):
            run_id = int(path.split("/")[3])
            for runs in w.runs.values():
                for r in runs:
                    if r["id"] == run_id:
                        return copy.deepcopy(r)
            raise KeyError(path)
        if path == "/branches/main":
            return {"commit": {"sha": w.main_head}}
        raise KeyError(path)

    def download(self, url):
        self.calls.append(("DOWNLOAD", url))
        return self.blob(url.removeprefix("zip://"))

    def http(self, url, *, method="GET", headers=None, data=None):
        self.calls.append((method, url, data))
        w = self.w
        host = next((h for h in gate.HOSTS if url.startswith(h)), None)
        if host in w.endpoint_down or (host is None and "attestation" in w.endpoint_down):
            return None
        if url == gate.ATTESTATION_ENDPOINT:
            assert method == "POST" and data == b"{}", "the gate may only send an empty body"
            authed = "Authorization" in (headers or {})
            status, error = w.transport["auth" if authed else "unauth"]
            return {"status": status, "body": {"error": error}, "error": error}
        if url == gate.SNAPSHOT_ENDPOINT:
            assert method == "GET" and data is None, "the snapshot read sends nothing"
            if "snapshot" in w.endpoint_down:
                return None
            return copy.deepcopy(w.snapshot_response)
        if url == gate.RUNTIME_FINGERPRINT_ENDPOINT:
            if "fingerprint" in w.endpoint_down:
                return None
            return {"status": 200, "body": copy.deepcopy(w.fingerprint), "error": None}
        if url.endswith("/version"):
            return {"status": 200, "body": copy.deepcopy(w.version_by_host.get(host, w.version)), "error": None}
        if url.endswith("/health"):
            return {"status": 200, "body": dict(w.health), "error": None}
        raise KeyError(url)

    def snapshot_pins(self):
        if self.w.pins is None:
            raise ValueError("SNAPSHOT_PINS_DISAGREE")
        return copy.deepcopy(self.w.pins)

    def railway_active(self, token):
        self.calls.append(("RAILWAY", token[:0]))
        return copy.deepcopy(self.w.railway)

    def tree(self, commit):
        return self.w.trees.get(commit)

    def is_ancestor(self, older, newer):
        return (older, newer) in self.w.ancestors


def evaluate(world=None, env=None, target=TARGET):
    world = world or World()
    fake = FakeIo(world)
    evidence = gate.run_gate(fake, dict(SECRETS if env is None else env), target_sha=target, main_head=world.main_head)
    return evidence, fake


class Positive(unittest.TestCase):
    def test_complete_green_state_passes_and_records_evidence(self):
        evidence, _ = evaluate()
        self.assertEqual(evidence["decision"], "PASS", json.dumps(evidence["stages"], indent=1))
        self.assertEqual(evidence["target_sha"], TARGET)
        self.assertEqual(evidence["stages"]["runtime"]["build_commit"], BUILD)
        self.assertEqual(evidence["stages"]["runtime"]["worker_tree"], TREE)
        self.assertTrue(evidence["stages"]["r5_8_3_artifact"]["digest"].startswith("sha256:"))
        self.assertEqual(set(evidence["side_effects"].values()), {"NOT_RUN"})
        self.assertEqual(evidence["predem_decision"], "READY_FOR_PREDEM_REVIEW")
        self.assertEqual(evidence["authorizes"], {"attempt_9": False, "canonical": False,
                                                  "real_dem_production": False, "real_dem_laboratory_dispatch": True})
        self.assertEqual(evidence["stages"]["persistence"]["status"], "PASS")
        self.assertEqual(evidence["stages"]["predem_matrix"]["verified"], 28)

    def test_push_without_worker_change_passes_on_tree_identity_not_on_build_label(self):
        # The image was built from an older commit; the worker tree is identical.
        evidence, _ = evaluate()
        self.assertNotEqual(evidence["stages"]["runtime"]["build_commit"], TARGET)
        self.assertEqual(evidence["stages"]["runtime"]["status"], "PASS")

    def test_rerun_is_idempotent_and_read_only(self):
        world = World()
        first, fake1 = evaluate(world)
        second, fake2 = evaluate(world)
        strip = lambda e: {k: v for k, v in e.items() if k != "checked_at"}
        self.assertEqual(strip(first), strip(second))
        for fake in (fake1, fake2):
            methods = {call[0] for call in fake.calls}
            self.assertLessEqual(methods, {"GET", "DOWNLOAD", "POST", "RAILWAY"})
            posts = [c for c in fake.calls if c[0] == "POST"]
            self.assertTrue(all(c[1] == gate.ATTESTATION_ENDPOINT and c[2] == b"{}" for c in posts))
            self.assertFalse(any("dispatches" in str(c[1]) for c in fake.calls))


class Negative(unittest.TestCase):
    def assertDecision(self, evidence, decision, stage_name, status, reason=None):
        self.assertEqual(evidence["decision"], decision)
        self.assertEqual(evidence["stages"][stage_name]["status"], status, evidence["stages"][stage_name])
        if reason:
            self.assertEqual(evidence["stages"][stage_name]["reason"], reason)

    def test_worker_tree_changed_but_image_not_rebuilt_fails(self):
        world = World()
        world.trees[TARGET] = "f" * 40
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "runtime", "FAIL", "WORKER_TREE_DIFFERS")

    def test_missing_secret_fails_closed_without_exposing_values(self):
        env = dict(SECRETS, PARSER_ATTESTATION_TRANSPORT_SECRET="")
        evidence, fake = evaluate(env=env)
        self.assertDecision(evidence, "FAIL", "transport", "FAIL", "SECRET_MISSING")
        self.assertFalse(any(c[0] == "POST" for c in fake.calls), "no probe without every secret")
        text = json.dumps(evidence)
        for value in SECRETS.values():
            if len(value) >= 32:
                self.assertNotIn(value, text)

    def test_unapproved_endpoint_fails(self):
        env = dict(SECRETS, PARSER_ATTESTATION_ENDPOINT="https://elsewhere.invalid/attest")
        evidence, _ = evaluate(env=env)
        self.assertDecision(evidence, "FAIL", "transport", "FAIL", "ENDPOINT_NOT_APPROVED")

    def test_transport_rejected_blocks_activation(self):
        world = World()
        world.transport["auth"] = (401, "UNAUTHORIZED")
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "transport", "FAIL", "TRANSPORT_UNEXPECTED_RESPONSE")

    def test_endpoint_accepting_requests_without_secret_fails(self):
        world = World()
        world.transport["unauth"] = (400, "ATTESTATION_PAYLOAD_INVALID")
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "transport", "FAIL", "TRANSPORT_UNEXPECTED_RESPONSE")

    def test_server_not_configured_fails(self):
        world = World()
        world.transport["unauth"] = (503, "ATTESTATION_SERVER_NOT_CONFIGURED")
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "transport", "FAIL", "SERVER_NOT_CONFIGURED")

    def test_unreachable_endpoints_block(self):
        world = World()
        world.endpoint_down = {"attestation"}
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "transport", "BLOCKED", "ENDPOINT_UNREACHABLE")
        world = World()
        world.endpoint_down = {gate.HOSTS[0]}
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "runtime", "BLOCKED", "HEALTH_NOT_OK")

    def test_runtime_identity_problems_fail(self):
        for mutate, reason in (
            (lambda w: w.version["build"].update(declared_revision_matches=False), "DECLARED_REVISION_MISMATCH"),
            (lambda w: w.version["build"].update(embedded=False), "BUILD_IDENTITY_NOT_EMBEDDED"),
            (lambda w: w.version_by_host.update({gate.HOSTS[1]: {"build": dict(w.version["build"], commit="a" * 40)}}),
             "HOSTS_REPORT_DIFFERENT_BUILDS"),
            (lambda w: w.railway.update(commitHash="b" * 40), "RAILWAY_DEPLOYMENT_COMMIT_MISMATCH"),
            (lambda w: w.ancestors.discard((BUILD, TARGET)), "BUILD_COMMIT_NOT_ON_TARGET_HISTORY"),
            (lambda w: w.version["parser"].update(build_revision="git:" + "c" * 40), "BUILD_REVISION_NOT_EMBEDDED_COMMIT"),
            (lambda w: w.version["parser"].update(semantic_revision="pypi-0.42.0"), "SEMANTIC_REVISION_INVALID"),
            (lambda w: w.version["parser"].update(semantic_revision=None), "SEMANTIC_REVISION_INVALID"),
            (lambda w: w.version_by_host.update({gate.HOSTS[1]: {"parser": dict(w.version["parser"], semantic_revision="git:" + "d" * 40),
                                                               "build": dict(w.version["build"])}}),
             "HOSTS_REPORT_DIFFERENT_REVISIONS"),
        ):
            world = World()
            mutate(world)
            evidence, _ = evaluate(world)
            self.assertDecision(evidence, "FAIL", "runtime", "FAIL", reason)

    def test_failed_r583_and_r584_runs_still_report_their_decisions(self):
        # A BLOCKED preflight now fails its job; the gate must still read why.
        world = World()
        world.runs["r5_8_3"][0]["conclusion"] = "failure"
        world.runs["r5_8_4"][0]["conclusion"] = "failure"
        world.r583_doc.update(decision="BLOCKED", failures=["RUNTIME_IDENTITY_MISMATCH:x"])
        world.r584_doc["own_scope"]["blockers"] = ["live_version_exact"]
        evidence, _ = evaluate(world)
        stages = evidence["stages"]
        self.assertEqual(evidence["decision"], "FAIL")
        self.assertEqual(stages["r5_8_3"]["reason"], "RUN_NOT_SUCCESS")
        self.assertEqual(stages["r5_8_3_artifact"]["status"], "PASS")
        self.assertEqual(stages["r5_8_3_decision"]["reason"], "R583_DECISION_NOT_GREEN")
        self.assertEqual(stages["r5_8_3_decision"]["failures"], ["RUNTIME_IDENTITY_MISMATCH:x"])
        self.assertEqual(stages["r5_8_4_artifact"]["status"], "PASS")
        self.assertEqual(stages["r5_8_4_decision"]["blockers"], ["live_version_exact"])

    def test_cancelled_or_running_r583_is_not_read_as_evidence(self):
        for conclusion, status in (("cancelled", "completed"), (None, "in_progress"), ("skipped", "completed")):
            world = World()
            world.runs["r5_8_3"][0].update(conclusion=conclusion, status=status)
            evidence, _ = evaluate(world)
            self.assertNotEqual(evidence["decision"], "PASS")
            self.assertEqual(evidence["stages"]["r5_8_3_decision"]["status"], "SKIPPED")

    def test_semantic_revision_must_describe_the_deployed_tree(self):
        # The state observed on 2026-10-12: build 10815fb4 (tree 8120c12a) but
        # PARSER_REVISION still names 5703b1d8, whose worker tree differs, while
        # declared_revision_matches is true because it only compares the build.
        old = "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76"
        world = World()
        world.version["parser"]["semantic_revision"] = f"git:{old}"
        world.trees[old] = "bf25eb865d7f735b0f26dd533f5b70ee52bb68ef"
        world.ancestors.add((old, TARGET))
        world.ancestors.add((old, BUILD))
        evidence, _ = evaluate(world)
        self.assertTrue(world.version["build"]["declared_revision_matches"])
        self.assertDecision(evidence, "FAIL", "runtime", "FAIL", "SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD")
        # Not on the target's history (for example only on another branch): refused.
        world.ancestors.discard((old, TARGET))
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "runtime", "FAIL", "SEMANTIC_REVISION_NOT_ON_TARGET_HISTORY")
        # Unknown to git: refused, never assumed.
        world = World()
        world.version["parser"]["semantic_revision"] = "git:" + "e" * 40
        world.ancestors.add(("e" * 40, TARGET))
        world.ancestors.add(("e" * 40, BUILD))
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "runtime", "FAIL", "SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD")

    def test_semantic_revision_of_an_earlier_commit_with_the_same_tree_passes(self):
        earlier = "a5dcdfdb6716743025f5159c073b13db2172aee0"
        world = World()
        world.version["parser"]["semantic_revision"] = f"git:{earlier}"
        world.trees[earlier] = TREE
        world.ancestors.add((earlier, TARGET))
        world.ancestors.add((earlier, BUILD))
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["decision"], "PASS", evidence["stages"]["runtime"])
        self.assertEqual(evidence["stages"]["runtime"]["semantic_revision"], f"git:{earlier}")

    def test_reviewed_semantic_build_pair_allows_only_pinned_diagnostic_delta(self):
        semantic = "c2e045b0f71a7699c935b65ffe514fe526889de3"
        build = "eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1"
        world = World()
        world.version["parser"].update(
            revision=f"git:{semantic}",
            semantic_revision=f"git:{semantic}",
            build_revision=f"git:{build}",
        )
        world.version["build"].update(
            commit=build, embedded=True, source="railway", declared_revision_matches=True
        )
        world.railway["commitHash"] = build
        semantic_tree = "03bf52061ff18f835e9ce37244123868020f3ab5"
        build_tree = "bee2315558df73730bc708c0364355792bcae2eb"
        world.trees.update({semantic: semantic_tree, build: build_tree, TARGET: build_tree})
        world.ancestors.update({(semantic, build), (semantic, TARGET), (build, TARGET)})
        fake = FakeIo(world)
        observed = {}

        def approve_only_reviewed_delta(identity, build_info):
            observed["identity"] = identity
            observed["build"] = build_info
            return []

        result = gate.evaluate_runtime(
            versions={host: world.version for host in gate.HOSTS},
            healths={host: world.health for host in gate.HOSTS},
            target_sha=TARGET,
            tree=fake.tree,
            is_ancestor=fake.is_ancestor,
            railway=world.railway,
            semantic_build_validator=approve_only_reviewed_delta,
        )
        self.assertEqual(result["status"], "PASS", result)
        self.assertEqual(result["semantic_build_delta"], "reviewed_diagnostic_only_delta")
        self.assertIn("exact changed-file allowlist", result["note"])
        self.assertEqual(observed["identity"], {
            "semantic_revision": f"git:{semantic}", "build_revision": f"git:{build}"
        })
        self.assertEqual(observed["build"]["commit"], build)

    def test_reviewed_semantic_build_pair_rejects_a_failed_delta_validator(self):
        semantic = "c2e045b0f71a7699c935b65ffe514fe526889de3"
        build = "eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1"
        world = World()
        world.version["parser"].update(
            revision=f"git:{semantic}",
            semantic_revision=f"git:{semantic}",
            build_revision=f"git:{build}",
        )
        world.version["build"].update(
            commit=build, embedded=True, source="railway", declared_revision_matches=True
        )
        world.railway["commitHash"] = build
        world.trees.update({
            semantic: "03bf52061ff18f835e9ce37244123868020f3ab5",
            build: "bee2315558df73730bc708c0364355792bcae2eb",
            TARGET: "bee2315558df73730bc708c0364355792bcae2eb",
        })
        world.ancestors.update({(semantic, build), (semantic, TARGET), (build, TARGET)})
        fake = FakeIo(world)
        result = gate.evaluate_runtime(
            versions={host: world.version for host in gate.HOSTS},
            healths={host: world.health for host in gate.HOSTS},
            target_sha=TARGET,
            tree=fake.tree,
            is_ancestor=fake.is_ancestor,
            railway=world.railway,
            semantic_build_validator=lambda _identity, _build: ["SEMANTIC_BUILD_DELTA_NOT_APPROVED"],
        )
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["reason"], "SEMANTIC_BUILD_DELTA_NOT_APPROVED")

    def test_railway_unverified_blocks(self):
        world = World()
        world.railway = None
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "runtime", "BLOCKED", "RAILWAY_ACTIVE_DEPLOYMENT_UNVERIFIED")
        world = World()
        world.railway = {"error": "RAILWAY_API_HTTP_200", "messages": ["Problem processing request"]}
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "runtime", "BLOCKED", "RAILWAY_ACTIVE_DEPLOYMENT_UNVERIFIED")
        self.assertEqual(evidence["stages"]["runtime"]["error"], "RAILWAY_API_HTTP_200")

    def test_artifact_for_another_commit_is_rejected(self):
        world = World()
        world.r583_doc["github"]["sha"] = BUILD
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_3_decision", "FAIL", "R583_EVIDENCE_FOR_ANOTHER_COMMIT")

    def test_tampered_artifact_is_rejected(self):
        world = World()
        name = next(iter(world.artifacts))
        world.digest_override[name] = "sha256:" + "0" * 64
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_3_artifact", "FAIL", "ARTIFACT_DIGEST_MISMATCH")

    def test_artifact_produced_by_another_run_is_rejected(self):
        world = World()
        name = next(iter(world.artifacts))
        run_id, member, attr = world.artifacts[name]
        world.artifacts[name] = (run_id + 1000, member, attr)
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_3_artifact", "FAIL", "ARTIFACT_FROM_ANOTHER_RUN")

    def test_missing_artifact_blocks(self):
        world = World()
        world.artifacts = {}
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "r5_8_3_artifact", "BLOCKED", "ARTIFACT_NOT_FOUND")

    def test_r583_artifact_name_matches_the_workflow_upload_name(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/r5-8-3-read-only-preflight.yml").read_text()
        self.assertIn("name: r5-8-3-preflight-${{ github.sha }}-${{ github.run_id }}-attempt-${{ github.run_attempt }}",
                      workflow)
        self.assertEqual(gate.r583_artifact_name("abc", 7, 3), "r5-8-3-preflight-abc-7-attempt-3")

    def test_unsuffixed_r583_artifact_name_blocks(self):
        # The pre-#151 name must never be accepted as evidence (run 39100058543 regression).
        world = World()
        r583_id = world.runs["r5_8_3"][0]["id"]
        world.artifacts[f"r5-8-3-preflight-{TARGET}-{r583_id}"] = world.artifacts.pop(
            f"r5-8-3-preflight-{TARGET}-{r583_id}-attempt-1")
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "r5_8_3_artifact", "BLOCKED", "ARTIFACT_NOT_FOUND")

    def test_r583_artifact_of_an_earlier_attempt_blocks(self):
        world = World()
        world.runs["r5_8_3"][0]["run_attempt"] = 2
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "r5_8_3_artifact", "BLOCKED", "ARTIFACT_NOT_FOUND")

    def test_r583_artifact_of_the_selected_attempt_passes(self):
        world = World()
        r583_id = world.runs["r5_8_3"][0]["id"]
        world.runs["r5_8_3"][0]["run_attempt"] = 2
        world.artifacts[f"r5-8-3-preflight-{TARGET}-{r583_id}-attempt-2"] = world.artifacts.pop(
            f"r5-8-3-preflight-{TARGET}-{r583_id}-attempt-1")
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["r5_8_3_artifact"]["status"], "PASS")

    def test_green_check_with_blocked_decision_fails(self):
        # This is the real state of R5.8.3 on 7e6eb463: the job is green, its decision is BLOCKED.
        world = World()
        world.r583_doc.update(decision="BLOCKED", failures=["RAILWAY_DEPLOYMENT_BINDING_MISMATCH"])
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_3_decision", "FAIL", "R583_DECISION_NOT_GREEN")
        self.assertEqual(evidence["stages"]["r5_8_3_decision"]["failures"], ["RAILWAY_DEPLOYMENT_BINDING_MISMATCH"])

    def test_predem_blocked_by_gates_the_repository_cannot_prove(self):
        # The real state: collectors that need a fresh attestation or an
        # authorized read of the managed database have delivered nothing.
        world = World()
        r583_id = world.runs["r5_8_3"][0]["id"]
        external = {g for g in r584.PRE_DEM_GATES
                    if r584.GATE_SPECS[g][1] in (r584.FRESH_ATTESTATION, r584.MANAGED_DB_READ)}
        own = {g for g in r584.PRE_DEM_GATES if g not in gate.ACTIVATION_COLLECTED}
        world.r584_doc = r584_document(r583_id, verified_pre=own - external)
        # The snapshot route is not published yet: the 10 gates it proves stay unproven,
        # whatever R5.8.4 says about them.
        world.snapshot_response = {"status": 404, "body": None, "error": None}
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "predem_matrix", "BLOCKED", "PREDEM_GATES_NOT_VERIFIED")
        self.assertEqual(external, set(gate.SNAPSHOT_GATES))
        self.assertEqual(set(evidence["stages"]["predem_matrix"]["blockers"]), external)
        self.assertEqual(evidence["stages"]["managed_snapshot"]["reason"], "SNAPSHOT_ENDPOINT_NOT_PUBLISHED")
        self.assertEqual(evidence["predem_decision"], "BLOCKED")
        self.assertFalse(evidence["authorizes"]["real_dem_laboratory_dispatch"])

    def test_post_dem_claims_before_the_run_fail(self):
        world = World()
        doc = world.r584_doc
        doc["gates"]["determinism"]["status"] = "VERIFIED"
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_4_decision", "FAIL", "R584_POST_DEM_CLAIMED_BEFORE_THE_RUN")

    def test_activation_collected_gates_need_their_own_stages(self):
        for mutate, stage_name in (
            (lambda w: w.transport.update(auth=(401, "UNAUTHORIZED")), "transport"),
            (lambda w: w.queue_annotations[31].pop(0), "persistence"),
        ):
            world = World()
            mutate(world)
            evidence, _ = evaluate(world)
            self.assertNotEqual(evidence["decision"], "PASS")
            self.assertEqual(evidence["predem_decision"], "BLOCKED")
            self.assertIn(evidence["stages"]["predem_matrix"]["status"], ("BLOCKED",))

    def test_persistence_probe_problems(self):
        cases = []
        world = World(); world.queue_annotations[32] = []; cases.append((world, "BLOCKED", "QUEUE_PROBE_MISSING"))
        world = World(); world.queue_jobs = world.queue_jobs[:1]; cases.append((world, "BLOCKED", "QUEUE_JOB_NOT_FOUND"))
        world = World()
        bad = json.loads(world.queue_annotations[31][0]["message"]); bad.update(status="FAIL", not_passed=["x"])
        world.queue_annotations[31][0]["message"] = json.dumps(bad); cases.append((world, "FAIL", "QUEUE_PROBE_NOT_PASS"))
        world = World()
        bad = json.loads(world.queue_annotations[31][0]["message"]); bad.update(passed=6)
        world.queue_annotations[31][0]["message"] = json.dumps(bad); cases.append((world, "FAIL", "QUEUE_PROBE_NOT_PASS"))
        world = World(); world.queue_annotations[32].append(dict(world.queue_annotations[31][0]))
        cases.append((world, "FAIL", "QUEUE_PROBE_REPORTED_TWICE"))
        world = World(); world.queue_annotations[31][0]["message"] = "not json"
        cases.append((world, "FAIL", "QUEUE_PROBE_REPORT_UNREADABLE"))
        for world, status, reason in cases:
            evidence, _ = evaluate(world)
            self.assertEqual(evidence["stages"]["persistence"]["status"], status, reason)
            self.assertEqual(evidence["stages"]["persistence"]["reason"], reason)
            self.assertNotEqual(evidence["decision"], "PASS")

    def test_queue_run_missing_for_the_commit_blocks(self):
        world = World()
        world.runs["queue_semantics"] = []
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["persistence"]["status"], "SKIPPED")
        self.assertEqual(evidence["predem_decision"], "BLOCKED")

    def test_r584_blocked_or_bound_to_another_run_fails(self):
        world = World()
        world.r584_doc["own_scope"]["blockers"] = ["live_version_exact"]
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_4_decision", "FAIL", "R584_OWN_SCOPE_NOT_VERIFIED")
        for mutate in (lambda d: d.update(schema_version=1), lambda d: d["gates"].pop("determinism"),
                       lambda d: d.pop("own_scope"), lambda d: d.update(phases={})):
            world = World()
            mutate(world.r584_doc)
            evidence, _ = evaluate(world)
            self.assertDecision(evidence, "FAIL", "r5_8_4_decision", "FAIL", "R584_MATRIX_MALFORMED")
        world = World()
        world.r584_doc["canonical_authorized"] = True
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_4_decision", "FAIL", "R584_CLAIMS_AUTHORIZATION")
        world = World()
        world.r584_doc["source"]["workflow_run_id"] = "1"
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_4_decision", "FAIL", "R584_EVIDENCE_FOR_ANOTHER_R583_RUN")

    def test_dependent_gate_failed_skipped_or_running_blocks_activation(self):
        for conclusion, status, expected in (("failure", "completed", "FAIL"), ("skipped", "completed", "FAIL"),
                                             ("cancelled", "completed", "FAIL"), (None, "in_progress", "BLOCKED")):
            world = World()
            world.runs["quality_gates"] = [run(100, "quality_gates", conclusion=conclusion, status=status)]
            evidence, _ = evaluate(world)
            self.assertDecision(evidence, expected, "quality_gates", expected)
            self.assertEqual(evidence["stages"]["main_required_gates"]["status"], "SKIPPED")

    def test_skipped_aggregate_job_inside_green_workflow_fails(self):
        world = World()
        world.jobs[0]["conclusion"] = "skipped"
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "main_required_gates", "FAIL", "JOB_NOT_SUCCESS")

    def test_latest_rerun_decides(self):
        world = World()
        world.runs["f553_post_completion"] = [run(101, "f553_post_completion", attempt=1),
                                              run(101, "f553_post_completion", conclusion="failure", attempt=2)]
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "f553_post_completion", "FAIL", "RUN_NOT_SUCCESS")

    def test_run_for_another_commit_or_repository_is_not_evidence(self):
        world = World()
        world.runs["r5_8_3"] = [run(102, "r5_8_3", sha=BUILD)]
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "r5_8_3", "BLOCKED", "RUN_NOT_FOUND")

    def test_manual_dispatch_cannot_skip_prerequisites_or_target_an_old_commit(self):
        env = dict(SECRETS, GITHUB_EVENT_NAME="workflow_dispatch")
        world = World()
        world.runs["r5_8_4"] = []
        evidence, _ = evaluate(world, env=env)
        self.assertDecision(evidence, "BLOCKED", "r5_8_4", "BLOCKED", "RUN_NOT_FOUND")
        world = World()
        world.main_head = "c" * 40  # main moved on: old evidence is stale
        evidence, fake = evaluate(world, env=env)
        self.assertDecision(evidence, "BLOCKED", "target", "BLOCKED", "TARGET_IS_NOT_CURRENT_MAIN_HEAD")
        self.assertEqual(evidence["stages"]["runtime"]["status"], "SKIPPED")
        self.assertNotIn("quality_gates", evidence["stages"])

    def test_github_api_error_is_recorded_as_blocked(self):
        world = World()
        world.runs = {}
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "prerequisites", "BLOCKED", "COLLECTION_ERROR")

    def test_invalid_target_fails(self):
        evidence, _ = evaluate(target="")
        self.assertEqual(evidence["decision"], "FAIL")


class RailwayQuery(unittest.TestCase):
    def query(self, response):
        io_ = gate.Io("", Path("."))
        io_.http = lambda *a, **k: response
        return io_.railway_active("token")

    def test_picks_newest_success_and_reports_errors(self):
        body = {"data": {"deployments": {"edges": [
            {"node": {"id": "old", "status": "REMOVED", "createdAt": "2026-10-05", "meta": {"commitHash": "a" * 40}}},
            {"node": {"id": "new", "status": "SUCCESS", "createdAt": "2026-10-12", "meta": {"commitHash": BUILD, "branch": "main"}}},
            {"node": {"id": "older", "status": "SUCCESS", "createdAt": "2026-10-01", "meta": {"commitHash": "b" * 40}}},
            {"node": {"id": "skip", "status": "SKIPPED", "createdAt": "2026-10-12T20", "meta": {}}}]}}}
        self.assertEqual(self.query({"status": 200, "body": body})["id"], "new")
        self.assertEqual(self.query(None), {"error": "RAILWAY_API_UNREACHABLE"})
        failed = self.query({"status": 200, "body": {"errors": [{"message": "Not Authorized"}]}})
        self.assertEqual(failed["error"], "RAILWAY_API_HTTP_200")
        self.assertEqual(failed["messages"], ["Not Authorized"])
        self.assertEqual(self.query({"status": 200, "body": {"data": {"deployments": {"edges": []}}}})["error"],
                         "RAILWAY_NO_SUCCESS_DEPLOYMENT")


class Annotations(unittest.TestCase):
    def test_annotations_carry_decision_and_reasons_but_never_secret_values(self):
        world = World()
        world.r583_doc.update(decision="BLOCKED", failures=["RAILWAY_DEPLOYMENT_BINDING_MISMATCH"])
        evidence, _ = evaluate(world, env=dict(SECRETS, PARSER_ATTESTATION_HMAC_SECRET=""))
        lines = gate.annotations(evidence)
        self.assertTrue(lines[0].startswith("::notice title=H.3-E activation gate::decision=FAIL"))
        joined = "\n".join(lines)
        self.assertIn("RAILWAY_DEPLOYMENT_BINDING_MISMATCH", joined)
        self.assertIn("PARSER_ATTESTATION_HMAC_SECRET", joined)  # the name of the missing secret
        for value in SECRETS.values():
            if len(value) >= 32:
                self.assertNotIn(value, joined)
        self.assertTrue(all("\n" not in line for line in lines))

    def test_escaping(self):
        self.assertEqual(gate._escape("a%b\nc"), "a%25b%0Ac")


class Decide(unittest.TestCase):
    def test_skipped_is_never_pass(self):
        self.assertEqual(gate.decide({"a": {"status": "PASS"}, "b": {"status": "SKIPPED"}}), "BLOCKED")
        self.assertEqual(gate.decide({"a": {"status": "SKIPPED"}}), "BLOCKED")

    def test_empty_or_unknown_fails(self):
        self.assertEqual(gate.decide({}), "FAIL")
        self.assertEqual(gate.decide({"a": {"status": "success"}}), "FAIL")

    def test_fail_dominates(self):
        self.assertEqual(gate.decide({"a": {"status": "BLOCKED"}, "b": {"status": "FAIL"}}), "FAIL")


if __name__ == "__main__":
    unittest.main()


class Categories(unittest.TestCase):
    def test_every_reason_the_gate_emits_is_classified(self):
        import re as _re
        source = Path(gate.__file__).read_text()
        emitted = set(_re.findall(r'reason="([A-Z0-9_]+)"', source))
        self.assertTrue(emitted)
        self.assertEqual(sorted(emitted - set(gate.REASON_CATEGORY)), [])

    def test_categories_separate_negative_results_from_evidence_problems(self):
        world = World()
        world.r583_doc.update(decision="BLOCKED", failures=["X"])
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["r5_8_3_decision"]["category"], "REJECTED")
        world = World()
        world.digest_override[f"r5-8-3-preflight-{TARGET}-{world.runs['r5_8_3'][0]['id']}-attempt-1"] = "sha256:" + "0" * 64
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["r5_8_3_artifact"]["category"], "EVIDENCE_INVALID")
        world = World()
        world.runs["r5_8_3"][0].update(status="in_progress", conclusion=None)
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["r5_8_3"]["category"], "STILL_RUNNING")
        world = World()
        world.endpoint_down = {"attestation"}
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["transport"]["category"], "INFRASTRUCTURE_FAILURE")
        world = World()
        world.r583_doc["github"]["sha"] = "e" * 40
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["r5_8_3_decision"]["category"], "EVIDENCE_STALE")
        world = World()
        world.runs["queue_semantics"] = []
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["queue_semantics"]["category"], "EVIDENCE_MISSING")
        self.assertEqual(evidence["stages"]["persistence"]["category"], "NOT_EVALUATED")
        green, _ = evaluate()
        self.assertEqual(set(green["categories"]), {"APPROVED"})

    def test_unknown_reason_is_never_approved(self):
        for status in ("FAIL", "BLOCKED", "SKIPPED"):
            self.assertNotEqual(gate.categorize({"status": status, "reason": "SOMETHING_NEW"}), "APPROVED")


class MatrixWithBlockers(unittest.TestCase):
    def test_a_matrix_failing_only_on_its_own_blockers_is_still_reported(self):
        # The state of main c8c6d6ec: R5.8.4 own scope blocked, predem said
        # R584_MATRIX_UNAVAILABLE and listed nothing.
        world = World()
        r583_id = world.runs["r5_8_3"][0]["id"]
        own = {g for g in r584.PRE_DEM_GATES if g not in gate.ACTIVATION_COLLECTED}
        missing = {"live_version_exact", "critical_hashes_exact", "hmac_configured"}
        world.r584_doc = r584_document(r583_id, verified_pre=own - missing)
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["r5_8_4_decision"]["reason"], "R584_OWN_SCOPE_NOT_VERIFIED")
        predem = evidence["stages"]["predem_matrix"]
        self.assertEqual(predem["reason"], "PREDEM_GATES_NOT_VERIFIED")
        # hmac_configured comes from this run's snapshot (green here), not from R5.8.4.
        self.assertEqual(set(predem["blockers"]), missing - {"hmac_configured"})
        self.assertEqual(predem["verified"], 26)
        self.assertEqual(predem["gates"]["remote_ci"]["collector"], "H.3-E activation gate")
        self.assertEqual(evidence["decision"], "FAIL")
        self.assertEqual(evidence["predem_decision"], "BLOCKED")

    def test_a_matrix_with_an_integrity_problem_is_not_consumed(self):
        for mutate in (lambda d: d["source"].update(workflow_run_id="1"),
                       lambda d: d.update(canonical_authorized=True),
                       lambda d: d["gates"]["determinism"].update(status="VERIFIED")):
            world = World()
            mutate(world.r584_doc)
            evidence, _ = evaluate(world)
            self.assertEqual(evidence["stages"]["predem_matrix"]["reason"], "R584_MATRIX_UNAVAILABLE")
            self.assertEqual(evidence["stages"]["predem_matrix"]["category"], "EVIDENCE_INVALID")


class IdentityRecord(unittest.TestCase):
    def test_each_identity_item_is_recorded_separately(self):
        world = World()
        old = "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76"
        world.version["parser"]["semantic_revision"] = f"git:{old}"
        world.trees[old] = "bf25eb865d7f735b0f26dd533f5b70ee52bb68ef"
        world.ancestors.add((old, TARGET))
        evidence, _ = evaluate(world)
        identity = evidence["stages"]["runtime"]["identity"]
        host = identity["hosts"][gate.HOSTS[0]]
        self.assertEqual(host["image_build_commit"], BUILD)
        self.assertEqual(host["build_worker_tree"], TREE)
        self.assertEqual(host["declared_semantic_revision"], f"git:{old}")
        self.assertEqual(host["semantic_worker_tree"], "bf25eb865d7f735b0f26dd533f5b70ee52bb68ef")
        self.assertTrue(host["declared_revision_matches"])
        self.assertEqual(identity["railway_active_deployment"]["id"], "3ad4b1fe-9b9e-4fec-b79a-4215d27aab29")
        self.assertEqual(identity["bridge_expected_worker_build_commit"], "NOT_OBSERVABLE_FROM_CI")
        self.assertEqual(evidence["stages"]["runtime"]["reason"], "SEMANTIC_REVISION_DOES_NOT_DESCRIBE_BUILD")

    def test_replaced_deployment_with_a_new_build_is_refused(self):
        # The state after #104: Railway serves a new build (c8c6d6ec) while the
        # declared build revision still names 10815fb4.
        world = World()
        new = "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d"
        world.version["build"].update(commit=new, declared_revision_matches=False)
        world.railway.update(id="c0aa8a55-a2a8-43e4-924e-0966171cddcf", commitHash=new)
        world.trees[new] = TREE
        world.ancestors.add((new, TARGET))
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["runtime"]["reason"], "DECLARED_REVISION_MISMATCH")
        self.assertEqual(evidence["stages"]["runtime"]["identity"]["hosts"][gate.HOSTS[0]]["image_build_commit"], new)


class ParserLock(unittest.TestCase):
    def test_the_app_revision_lock_must_accept_what_both_hosts_serve(self):
        evidence, _ = evaluate()
        self.assertEqual(evidence["stages"]["parser_lock"]["status"], "PASS")
        stale = "git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d"
        cases = (
            (lambda w: w.fingerprint.pop("parserLock"), "BLOCKED", "PARSER_LOCK_NOT_PUBLISHED", "EVIDENCE_MISSING"),
            # The 2026-10-14 failure: a stale environment override of the build revision.
            (lambda w: w.fingerprint["parserLock"].update(buildRevision=stale, buildRevisionSource="env"),
             "FAIL", "PARSER_LOCK_BUILD_MISMATCH", "REJECTED"),
            (lambda w: w.fingerprint["parserLock"].update(revision=stale), "FAIL", "PARSER_LOCK_REVISION_MISMATCH",
             "REJECTED"),
            (lambda w: w.fingerprint["parserLock"].update(buildRevision=None), "FAIL",
             "PARSER_LOCK_BUILD_UNCONFIGURED", "REJECTED"),
            (lambda w: w.fingerprint["parserLock"].update(buildRevisionRequired=False), "FAIL",
             "PARSER_LOCK_NOT_REQUIRED", "REJECTED"),
            (lambda w: w.fingerprint["parserLock"].update(version="0.41.0"), "FAIL", "PARSER_LOCK_IDENTITY_MISMATCH",
             "REJECTED"),
            (lambda w: w.version_by_host.update({gate.HOSTS[1]: {**w.version, "parser": dict(
                w.version["parser"], build_revision=stale)}}), "FAIL", "PARSER_LOCK_BUILD_MISMATCH", "REJECTED"),
        )
        for mutate, status, reason, category in cases:
            world = World()
            mutate(world)
            evidence, _ = evaluate(world)
            lock = evidence["stages"]["parser_lock"]
            self.assertEqual((lock["status"], lock["reason"], lock["category"]), (status, reason, category), reason)
            self.assertNotEqual(evidence["decision"], "PASS")


class BridgeIdentity(unittest.TestCase):
    def test_bridge_expectation_must_equal_the_served_build(self):
        evidence, _ = evaluate()
        self.assertEqual(evidence["stages"]["bridge_identity"]["status"], "PASS")
        cases = (
            (lambda w: w.fingerprint.pop("bridge"), "BLOCKED", "BRIDGE_IDENTITY_NOT_PUBLISHED", "EVIDENCE_MISSING"),
            (lambda w: w.endpoint_down.add("fingerprint"), "BLOCKED", "BRIDGE_IDENTITY_UNREACHABLE",
             "INFRASTRUCTURE_FAILURE"),
            # served build and bridge expectation differ (as when a redeploy changes the image)
            (lambda w: w.fingerprint["bridge"].update(expectedWorkerBuildCommit="c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d"),
             "FAIL", "BRIDGE_EXPECTED_BUILD_MISMATCH", "REJECTED"),
            (lambda w: w.fingerprint["bridge"].update(expectedWorkerBuildCommit=None, configured=False),
             "FAIL", "BRIDGE_EXPECTED_BUILD_UNCONFIGURED", "REJECTED"),
            (lambda w: w.fingerprint["bridge"].update(enforced=False), "FAIL", "BRIDGE_IDENTITY_NOT_ENFORCED", "REJECTED"),
            (lambda w: w.version_by_host.update({gate.HOSTS[1]: {"parser": dict(w.version["parser"]),
                                                               "build": dict(w.version["build"], commit="a" * 40)}}),
             "FAIL", "BRIDGE_EXPECTED_BUILD_MISMATCH", "REJECTED"),
        )
        for mutate, status, reason, category in cases:
            world = World()
            mutate(world)
            evidence, _ = evaluate(world)
            bridge = evidence["stages"]["bridge_identity"]
            self.assertEqual((bridge["status"], bridge["reason"], bridge["category"]), (status, reason, category))
            self.assertNotEqual(evidence["decision"], "PASS")
            self.assertEqual(evidence["predem_decision"], "BLOCKED")
        world = World()
        world.endpoint_down = {gate.HOSTS[0]}
        evidence, _ = evaluate(world)
        self.assertEqual(evidence["stages"]["bridge_identity"]["reason"], "SERVED_BUILD_UNAVAILABLE")

    def test_every_bridge_problem_is_reported_in_one_run(self):
        # The published state of 2026-10-13: expectation 10815fb4, served c8c6d6ec, not enforced.
        world = World()
        served = "c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d"
        world.version_by_host.update({h: {"parser": dict(world.version["parser"]),
                                          "build": dict(world.version["build"], commit=served)}
                                      for h in gate.HOSTS})
        world.fingerprint["bridge"].update(enforced=False)
        evidence, _ = evaluate(world)
        bridge = evidence["stages"]["bridge_identity"]
        self.assertEqual(bridge["reason"], "BRIDGE_IDENTITY_NOT_ENFORCED")
        self.assertEqual(bridge["problems"], ["BRIDGE_IDENTITY_NOT_ENFORCED", "BRIDGE_EXPECTED_BUILD_MISMATCH"])
        self.assertEqual(bridge["observed"]["served_build_commits"], [served])
        self.assertEqual(bridge["observed"]["expected_worker_build_commit"], BUILD)
        self.assertIs(bridge["observed"]["enforced"], False)
        line = next(l for l in gate.annotations(evidence) if "stage bridge_identity" in l)
        self.assertIn("BRIDGE_EXPECTED_BUILD_MISMATCH", line)  # every problem reaches the check annotation

    def test_an_unconfigured_expectation_is_never_echoed(self):
        world = World()
        world.fingerprint["bridge"].update(expectedWorkerBuildCommit="not-a-commit", configured=True)
        evidence, _ = evaluate(world)
        bridge = evidence["stages"]["bridge_identity"]
        self.assertEqual(bridge["problems"], ["BRIDGE_EXPECTED_BUILD_UNCONFIGURED"])
        self.assertIsNone(bridge["observed"]["expected_worker_build_commit"])


class ManagedSnapshot(unittest.TestCase):
    def test_every_snapshot_problem_keeps_the_ten_gates_unproven_or_failed(self):
        cases = (
            (lambda w: w.endpoint_down.add("snapshot"), "BLOCKED", "SNAPSHOT_ENDPOINT_UNREACHABLE"),
            (lambda w: w.snapshot_response.update(status=404, body=None), "BLOCKED", "SNAPSHOT_ENDPOINT_NOT_PUBLISHED"),
            (lambda w: w.snapshot_response.update(status=503, body={"error": "SNAPSHOT_UNAVAILABLE"}),
             "BLOCKED", "SNAPSHOT_UNAVAILABLE"),
            (lambda w: w.snapshot_response.update(status=401, body={"error": "UNAUTHORIZED"}),
             "FAIL", "SNAPSHOT_UNAUTHORIZED"),
            (lambda w: w.snapshot_response.update(body={"snapshot": "x"}), "FAIL", "SNAPSHOT_RESPONSE_INVALID"),
            (lambda w: setattr(w, "pins", None), "FAIL", "SNAPSHOT_PINS_UNAVAILABLE"),
            (lambda w: w.snapshot_response["body"]["snapshot"].update(snapshot_at="2026-01-01T00:00:00.000000Z"),
             "BLOCKED", "SNAPSHOT_UNUSABLE"),
            (lambda w: w.snapshot_response["body"]["snapshot"]["database"].update(recorder_md5="fe3250af2b461f03f459adf36b43ec21"),
             "BLOCKED", "SNAPSHOT_UNUSABLE"),
            (lambda w: w.snapshot_response["body"]["snapshot"]["retention"].update(deletion_metadata_mismatch=1),
             "FAIL", "SNAPSHOT_GATES_FAILED"),
            (lambda w: w.snapshot_response["body"]["snapshot"]["provenance"].update(latest=[]),
             "BLOCKED", "SNAPSHOT_GATES_NOT_VERIFIED"),
        )
        for mutate, status, reason in cases:
            world = World()
            mutate(world)
            evidence, _ = evaluate(world)
            snap = evidence["stages"]["managed_snapshot"]
            self.assertEqual((snap["status"], snap["reason"]), (status, reason), reason)
            self.assertEqual(evidence["predem_decision"], "BLOCKED", reason)
            self.assertNotEqual(evidence["decision"], "PASS", reason)

    def test_the_snapshot_request_carries_only_the_transport_header(self):
        _, fake = evaluate()
        calls = [c for c in fake.calls if c[:2] == ("GET", gate.SNAPSHOT_ENDPOINT)]
        self.assertEqual(len(calls), 1)

    def test_missing_secret_blocks_without_calling(self):
        env = dict(SECRETS)
        env.pop("PARSER_ATTESTATION_TRANSPORT_SECRET")
        evidence, fake = evaluate(env=env)
        self.assertEqual(evidence["stages"]["managed_snapshot"]["reason"], "SNAPSHOT_SECRET_MISSING")
        self.assertFalse([c for c in fake.calls if c[:2] == ("GET", gate.SNAPSHOT_ENDPOINT)])


def test_r584_artifact_name_is_per_r583_attempt_and_matches_the_workflow():
    """A re-run of the R5.8.3 run must yield a distinct R5.8.4 artifact name (production,
    2026-10-23: re-running push run 39876181736 after the Railway token rotation produced a
    second artifact under the old attempt-less name, and the gate refused the ambiguity)."""
    assert gate.r584_artifact_name("abc", 7, 1) != gate.r584_artifact_name("abc", 7, 2)
    assert gate.r584_artifact_name("abc", 7, None) == "r5-8-4-gate-reconciliation-7-attempt-1-abc"
    workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/r5-8-4-gate-reconciliation.yml").read_text()
    assert ("name: r5-8-4-gate-reconciliation-${{ github.event.workflow_run.id }}-attempt-"
            "${{ github.event.workflow_run.run_attempt }}-${{ github.event.workflow_run.head_sha }}") in workflow
