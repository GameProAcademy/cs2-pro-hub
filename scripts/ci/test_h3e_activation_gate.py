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
from pathlib import Path

spec = importlib.util.spec_from_file_location("h3e_activation_gate", Path(__file__).with_name("h3e_activation_gate.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

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
        self.r584_doc = {"side_effects": False, "decision": gate.R584_GREEN, "blockers": [],
                         "attempt_9_authorized": False, "canonical_authorized": False,
                         "source": {"workflow_run_id": str(r583_id), "workflow_run_sha": TARGET}}
        self.artifacts = {
            f"r5-8-3-preflight-{TARGET}-{r583_id}": (r583_id, "r5-8-3-preflight.json", "r583_doc"),
            f"r5-8-4-gate-reconciliation-{r583_id}-{TARGET}": (r584_id, "r5-8-4-gate-reconciliation.json", "r584_doc"),
        }
        self.digest_override = {}
        self.version = {"parser": {"name": "demoparser2"}, "contract_version": 1,
                        "build": {"commit": BUILD, "embedded": True, "source": "railway",
                                  "declared_revision_matches": True}}
        self.version_by_host = {}
        self.health = {"status": "ok"}
        self.endpoint_down = set()
        self.transport = {"unauth": (401, "UNAUTHORIZED"), "auth": (400, "ATTESTATION_PAYLOAD_INVALID")}
        self.railway = {"id": "3ad4b1fe-9b9e-4fec-b79a-4215d27aab29", "status": "SUCCESS",
                        "commitHash": BUILD, "branch": "main"}
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
            return {"jobs": copy.deepcopy(w.jobs)}
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
        if url.endswith("/version"):
            return {"status": 200, "body": copy.deepcopy(w.version_by_host.get(host, w.version)), "error": None}
        if url.endswith("/health"):
            return {"status": 200, "body": dict(w.health), "error": None}
        raise KeyError(url)

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
        self.assertEqual(set(evidence["authorizes"].values()), {False})

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
        ):
            world = World()
            mutate(world)
            evidence, _ = evaluate(world)
            self.assertDecision(evidence, "FAIL", "runtime", "FAIL", reason)

    def test_railway_unverified_blocks(self):
        world = World()
        world.railway = None
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "BLOCKED", "runtime", "BLOCKED", "RAILWAY_ACTIVE_DEPLOYMENT_UNVERIFIED")

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

    def test_green_check_with_blocked_decision_fails(self):
        # This is the real state of R5.8.3 on 7e6eb463: the job is green, its decision is BLOCKED.
        world = World()
        world.r583_doc.update(decision="BLOCKED", failures=["RAILWAY_DEPLOYMENT_BINDING_MISMATCH"])
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_3_decision", "FAIL", "R583_DECISION_NOT_GREEN")
        self.assertEqual(evidence["stages"]["r5_8_3_decision"]["failures"], ["RAILWAY_DEPLOYMENT_BINDING_MISMATCH"])

    def test_r584_blocked_or_bound_to_another_run_fails(self):
        world = World()
        world.r584_doc.update(decision="BLOCKED", blockers=["remote_ci"])
        evidence, _ = evaluate(world)
        self.assertDecision(evidence, "FAIL", "r5_8_4_decision", "FAIL", "R584_DECISION_NOT_READY")
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
