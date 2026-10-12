#!/usr/bin/env python3
"""End-to-end recovery probe on a disposable local Supabase stack.

  real download -> real parse -> real RAW chunks -> real completion and ACK
  -> injected loss or crash -> reconciliation / retry -> no duplicates

Everything on the path is the production code:
  worker   `uvicorn app:app` (the image's own command) with ENVIRONMENT=production:
           the durable consumer loop, the https download, the isolated parser
           child, demoparser2, the RAW artifact writer.
  bridge   the application's TypeScript route handlers with supabase-js
           (scripts/queue/integration/bridge_host.ts hosts them unchanged).
  storage  the local stack's Storage API; database: its Postgres with every
           repository migration, pgmq and the H3E91 ledger.
  demo     the pinned public fixture (LaihoE/demoparser test_demo.dem, MIT).

Only two things are not production: the bridge runs with NODE_ENV=test, because
in production the event bridge refuses durable execution events until deployed
source parity is proven; and time passes by expiring a lease instead of waiting
15 minutes.

Refuses anything but the local stack. Writes synthetic users, jobs and one
public-fixture match there. Never evidence about a real match.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SECRET = "recovery-integration-loopback-only"
WORK = Path(tempfile.mkdtemp(prefix="queue-e2e-"))
RESULTS: list[dict] = []
WORKERS: list[dict] = []

BUILD_INFO_PATH = ROOT / "services" / "cs2-demo-parser" / "BUILD_INFO.json"
PROBE_BUILD_INFO_CREATED = False


def ensure_probe_build_identity() -> None:
    """Give the source-checkout E2E worker the same immutable identity contract as an image.

    This is local-disposable test setup only. Never overwrite a real image's
    BUILD_INFO.json and never source the identity from a runtime env variable.
    """
    global PROBE_BUILD_INFO_CREATED
    if BUILD_INFO_PATH.exists():
        return
    commit = (os.environ.get("GITHUB_SHA") or subprocess.run(
        ["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=ROOT, check=True
    ).stdout.strip()).lower()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeError("E2E_WORKER_BUILD_IDENTITY_UNAVAILABLE")
    BUILD_INFO_PATH.write_text(json.dumps({"commit": commit, "source": "build-arg"}) + "\n", encoding="utf-8")
    PROBE_BUILD_INFO_CREATED = True


def cleanup_probe_build_identity() -> None:
    global PROBE_BUILD_INFO_CREATED
    if PROBE_BUILD_INFO_CREATED:
        try:
            BUILD_INFO_PATH.unlink()
        except FileNotFoundError:
            pass
        PROBE_BUILD_INFO_CREATED = False


def stack() -> dict:
    data = json.loads(subprocess.run(["supabase", "status", "-o", "json"], capture_output=True, text=True,
                                     check=True, cwd=ROOT).stdout)
    db, api, key = data.get("DB_URL", ""), data.get("API_URL", ""), data.get("SERVICE_ROLE_KEY", "")
    parsed_db, parsed_api = urlsplit(db), urlsplit(api)
    if (parsed_db.hostname not in ("127.0.0.1", "localhost") or parsed_db.port != 54322
            or parsed_api.hostname not in ("127.0.0.1", "localhost") or parsed_api.port != 54321 or not key):
        raise SystemExit("RECOVERY_INTEGRATION_REFUSES_NON_LOCAL_STACK")
    return {"db": db, "api": api, "key": key, "db_parts": parsed_db}


STACK = stack()
os.environ.update(QUEUE_PROBE_PGHOST="127.0.0.1", QUEUE_PROBE_PGPORT="54322",
                  QUEUE_PROBE_PGUSER=STACK["db_parts"].username or "postgres",
                  QUEUE_PROBE_PGDATABASE=STACK["db_parts"].path.lstrip("/") or "postgres",
                  PGPASSWORD=STACK["db_parts"].password or "")
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "integration"))
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "services" / "cs2-demo-parser"))

from queue_semantics_probe import expire_lease, js, refuse_non_local, sql  # noqa: E402
from edge import ApiEdge, BridgeEdge, Faults, kill_group  # noqa: E402
from f553.r11.fixture import acquire as acquire_fixture  # noqa: E402
from f553.r11.lifecycle import create_disposable_job, database_env, private_bucket  # noqa: E402
from worker import durable_execution_id  # noqa: E402

refuse_non_local()
FAULTS = Faults()
DB_ENV = database_env(STACK["db"])
REVISION = "git:" + (os.environ.get("GITHUB_SHA") or subprocess.run(
    ["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip())
SUCCESS = ("processed", "blocked_raw_audit")
TERMINAL = SUCCESS + ("failed", "cancelled")
SAFE_LOG = re.compile(r"(eyJ[A-Za-z0-9_\-.]+|token=[^&\s\"']+|Bearer \S+)")


# ---- processes -----------------------------------------------------------
def start_bridge(api_port: int, cert: Path) -> tuple[subprocess.Popen, int]:
    log = (WORK / "bridge.log").open("w")
    process = subprocess.Popen(
        ["bun", "scripts/queue/integration/bridge_host.ts", "0"], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
        start_new_session=True,
        env={**os.environ, "SUPABASE_URL": f"https://localhost:{api_port}", "SUPABASE_SERVICE_ROLE_KEY": STACK["key"],
             "DEMO_PIPELINE_BRIDGE_SECRET": SECRET, "NODE_ENV": "test", "NODE_EXTRA_CA_CERTS": str(cert),
             # The application accepts one pinned worker revision. This is its own
             # promotion override, pointed at the revision under test; the revision
             # lock itself stays on.
             "DEMO_PARSER_EXPECTED_REVISION": REVISION, "DEMO_PARSER_REVISION_REQUIRED": "true"},
    )
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        match = re.search(r"BRIDGE_HOST_READY (\d+)", (WORK / "bridge.log").read_text())
        if match:
            return process, int(match.group(1))
        if process.poll() is not None:
            break
        time.sleep(0.2)
    raise RuntimeError("bridge host did not start: " + tail(WORK / "bridge.log"))


def start_worker(name: str = "railway-parser-1", *, parse_timeout: float = 240.0, heartbeat: float = 2.0) -> dict:
    ensure_probe_build_identity()
    index = len(list(WORK.glob("worker-*.log")))
    tmp = WORK / f"tmp-{index}"
    tmp.mkdir()
    log_path = WORK / f"worker-{index}.log"
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", str(18200 + index),
         "--log-level", "info"],
        cwd=ROOT / "services" / "cs2-demo-parser", stdout=log_path.open("w"), stderr=subprocess.STDOUT,
        start_new_session=True,
        env={"PATH": os.environ["PATH"], "HOME": os.environ.get("HOME", "/tmp"), "ENVIRONMENT": "production",
             "PARSER_TOKEN": "recovery-integration-token", "PARSER_REVISION": REVISION,
             "DEMO_PIPELINE_BRIDGE_URL": f"http://127.0.0.1:{BRIDGE_EDGE_PORT}/api/public/pipeline-worker",
             "DEMO_PIPELINE_BRIDGE_SECRET": SECRET, "DEMO_PIPELINE_WORKER_ID": name,
             "DEMO_QUEUE_POLL_SECONDS": "0.5", "DEMO_QUEUE_HEARTBEAT_SECONDS": str(heartbeat),
             "PARSE_TIMEOUT_SECONDS": str(parse_timeout), "DOWNLOAD_TIMEOUT_SECONDS": "120",
             "MAX_DEMO_BYTES": str(200 * 1024 * 1024), "SSL_CERT_FILE": str(API_EDGE.cert), "TMPDIR": str(tmp)},
    )
    entry = {"name": name, "process": process, "log": log_path, "tmp": tmp}
    WORKERS.append(entry)
    return entry


def stop_workers() -> None:
    for entry in WORKERS:
        process = entry["process"]
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                kill_group(process.pid)
                process.wait()
    WORKERS.clear()
    cleanup_probe_build_identity()


def tail(path: Path, lines: int = 12) -> str:
    try:
        text = path.read_text(errors="replace").splitlines()[-lines:]
    except OSError:
        return "<no log>"
    return " | ".join(SAFE_LOG.sub("<redacted>", line)[:220] for line in text)


def wait_for(condition, timeout: float = 300.0, what: str = "condition"):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = condition()
        if value:
            return value
        time.sleep(0.25)
    raise AssertionError(f"timed out waiting for {what}")


# ---- observations --------------------------------------------------------
def job(job_id: str) -> dict:
    return js("select to_jsonb(j) from (select status, stage, retry_count, dispatch_attempt, delivery_count, "
              "queue_message_id, worker_id, error_code, error_message, match_id, lease_expires_at > now() as lease_live "
              f"from public.demo_jobs where id='{job_id}') j")


def ledger(job_id: str) -> list[dict]:
    return json.loads(sql("select coalesce(jsonb_agg(jsonb_build_object('execution', execution_id, 'type', event_type, "
                          "'outcome', outcome_code) order by id), '[]'::jsonb) "
                          f"from public.h3e91_execution_evidence_ledger where job_id='{job_id}'"))


def has_event(job_id: str, event_type: str, count: int = 1) -> bool:
    return sum(1 for event in ledger(job_id) if event["type"] == event_type) >= count


def canonical(sha: str) -> dict:
    """Counts and a content digest of the canonical rows of the fixture match."""
    matches = json.loads(sql("select coalesce(jsonb_agg(distinct match_id), '[]'::jsonb) from public.match_sources "
                             f"where source='demo' and fingerprint='{sha}'"))
    out = {"matches": len(matches)}
    if len(matches) != 1:
        return out
    match = matches[0]
    volatile = ("id", "created_at", "updated_at", "round_id")
    for table in ("match_participants", "match_rounds", "round_players", "round_events"):
        rows = json.loads(sql(f"select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.{table} t where match_id='{match}'"))
        cleaned = sorted(json.dumps({k: v for k, v in row.items() if k not in volatile}, sort_keys=True) for row in rows)
        out[table] = len(rows)
        out[table + "_digest"] = hashlib.sha256("\n".join(cleaned).encode()).hexdigest()[:16]
    out["sources"] = int(sql(f"select count(*) from public.match_sources where match_id='{match}'"))
    return out


def facts(item: dict) -> dict:
    job_id, state, events = item["job_id"], job(item["job_id"]), ledger(item["job_id"])
    prefix = f"{item['user_id']}/{item['upload_id']}/attempt-1/"
    artifact = sql("select to_jsonb(a) from (select id, status, raw_status, audit_status, total_chunks, root_digest "
                   f"from public.raw_evidence_artifacts where job_id='{job_id}') a")
    artifact = json.loads(artifact) if artifact else None
    chunks = verified = 0
    if artifact:
        chunks = int(sql(f"select count(*) from public.raw_evidence_chunks where artifact_id='{artifact['id']}'"))
        verified = int(sql(f"select count(*) from public.raw_evidence_chunks where artifact_id='{artifact['id']}' and status='verified'"))
    closures = json.loads(sql("select coalesce(jsonb_agg(jsonb_build_object('dispatch', dispatch_attempt, 'reason', reason, "
                              "'lifecycle', lifecycle, 'deliveries', delivery_count, 'retried', retried) order by id), "
                              f"'[]'::jsonb) from public.demo_job_dispatch_closures where job_id='{job_id}'"))
    return {
        "job_status": state["status"], "error_code": state["error_code"], "retry_count": state["retry_count"],
        "job_message": (state["error_message"] or "")[:160],
        "parser_executions": sum(1 for e in events if e["type"] == "EXECUTION_STARTED"),
        "execution_identities": len({e["execution"] for e in events}),
        "terminals": sorted(f"{e['type'].replace('EXECUTION_', '')}:{e['outcome']}" for e in events
                            if e["type"] in ("EXECUTION_FINISHED", "EXECUTION_FAILED", "EXECUTION_ABORTED")),
        "raw_artifacts": int(sql(f"select count(*) from public.raw_evidence_artifacts where job_id='{job_id}'")),
        "raw_status": artifact["status"] if artifact else None,
        "raw_audit": artifact["audit_status"] if artifact else None,
        "raw_chunks": chunks, "raw_chunks_verified": verified,
        "raw_objects": int(sql("select count(*) from storage.objects where bucket_id='cs2-raw-evidence' "
                               f"and name like '{prefix}%'")),
        "queued_messages": int(sql(f"select count(*) from pgmq.q_demo_parse where (message->>'job_id')='{job_id}'")),
        "leases": FAULTS.count("claim", job=job_id, status="claimed"),
        "complete_calls": FAULTS.count("complete", job=job_id),
        "fail_calls": FAULTS.count("fail", job=job_id),
        "heartbeats": FAULTS.count("heartbeat", job=job_id, accepted=True),
        "closures": closures,
        "canonical": canonical(item["demo_sha256"]),
    }


BASELINE: dict = {}


def invariants(item: dict, seen: dict) -> None:
    assert seen["raw_artifacts"] <= 1, "more than one RAW artifact for a job"
    assert seen["raw_chunks_verified"] <= seen["raw_chunks"]
    per_identity: dict[str, int] = {}
    for event in ledger(item["job_id"]):
        if event["type"] in ("EXECUTION_FINISHED", "EXECUTION_FAILED", "EXECUTION_ABORTED"):
            per_identity[event["execution"]] = per_identity.get(event["execution"], 0) + 1
    assert all(count == 1 for count in per_identity.values()), "two terminals for one execution identity"
    if seen["job_status"] in TERMINAL:
        assert seen["queued_messages"] == 0, "terminal job still has a queue message"
    if seen["job_status"] in SUCCESS:
        assert any(t.startswith("FINISHED:") for t in seen["terminals"]), "success without a FINISHED execution"
        assert seen["raw_status"] == "ready" and seen["raw_chunks"] > 0, "success without a ready RAW artifact"
        assert seen["raw_chunks_verified"] == seen["raw_chunks"], "unverified RAW chunk on a successful job"
        # One object per chunk plus the manifest: nothing duplicated, nothing orphaned.
        assert seen["raw_objects"] == seen["raw_chunks"] + 1, (seen["raw_objects"], seen["raw_chunks"])
    if seen["job_status"] == "failed":
        assert seen["error_code"], "terminal failure without a code"
    if seen["job_status"] == "processed":
        assert seen["canonical"]["matches"] == 1, "the fixture demo maps to more than one canonical match"
        snapshot = {k: v for k, v in seen["canonical"].items() if k != "sources"}
        if not BASELINE:
            BASELINE.update(snapshot)
        assert snapshot == BASELINE, "canonical content changed between jobs of the same demo"
    # No parser child outlives its worker and no demo or result file is left behind
    # by a worker that was allowed to stop.
    for entry in WORKERS:
        if entry.get("killed"):
            continue
        left = sorted(p.name for p in entry["tmp"].rglob("*") if p.is_file() and (p.name.startswith("demo-") or p.name.startswith("parser-result-")))
        assert not left or entry["process"].poll() is None and seen["job_status"] not in TERMINAL, f"temporary files left: {left[:3]}"


def new_item() -> dict:
    return create_disposable_job(DB_ENV, STACK["api"], STACK["key"], FIXTURE_PATH, FIXTURE)


def scenario(name: str):
    def wrap(fn):
        def run():
            stop_workers()
            FAULTS.clear()
            sql("update public.demo_jobs set status='failed', stage='failed', error_code='PROBE_CLEANUP', lease_expires_at=null "
                "where status in ('pending','processing')")
            sql("select pgmq.purge_queue('demo_parse')")
            entry = {"scenario": name}
            started = time.monotonic()
            item = None
            try:
                item = new_item()
                expected = fn(item) or {}
                # The job turns terminal one statement before its message is
                # acknowledged; observe after that has settled.
                settle = time.monotonic() + 10
                while time.monotonic() < settle and job(item["job_id"])["status"] in TERMINAL and facts(item)["queued_messages"]:
                    time.sleep(0.25)
                time.sleep(1.0)
                seen = facts(item)
                entry.update(seen)
                invariants(item, seen)
                for key, value in expected.items():
                    assert seen[key] == value, f"{key}: expected {value!r}, observed {seen[key]!r}"
                entry["status"] = "PASS"
            except AssertionError as error:
                if item:
                    try:
                        entry.update(facts(item))
                    except Exception:  # noqa: BLE001
                        pass
                entry.update({"status": "FAIL", "detail": str(error)[:400]})
            except Exception as error:  # noqa: BLE001 - reported, never hidden
                entry.update({"status": "ERROR", "detail": f"{type(error).__name__}: {str(error)[:400]}"})
            if entry["status"] != "PASS":
                entry["bridge_calls"] = [f"{c['point']}:{c.get('http')}:{c.get('status') or c.get('accepted')}" for c in FAULTS.calls
                                         if c.get("status") not in ("busy", "empty")][-16:]
                entry["bridge_log"] = tail(WORK / "bridge.log", 8)
                entry["worker_logs"] = [tail(w["log"], 8) for w in WORKERS][-2:]
            entry["seconds"] = round(time.monotonic() - started, 1)
            stop_workers()
            RESULTS.append(entry)
            print(f"[{entry['status']}] {name} {entry['seconds']}s", file=sys.stderr, flush=True)
        run.__name__ = name
        return run
    return wrap


def done(item: dict, timeout: float = 420.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        # A rejected intent cannot become terminal because the worker correctly
        # suppresses parsing. Fail immediately instead of burning the full 420 s.
        rejected_intents = [
            call for call in FAULTS.calls
            if call.get("point") == "event:EXECUTION_INTENT"
            and call.get("job") == item["job_id"]
            and call.get("http") == 409
        ]
        if rejected_intents:
            raise AssertionError("execution intent rejected by ledger (HTTP 409); parser must remain suppressed")
        state = job(item["job_id"])
        if state["status"] in TERMINAL:
            return state
        time.sleep(0.25)
    raise AssertionError("timed out waiting for a terminal job status")


def kill_worker(entry: dict) -> None:
    entry["killed"] = True
    kill_group(entry["process"].pid)
    entry["process"].wait()


def no_parser_process() -> bool:
    out = subprocess.run(["pgrep", "-f", "parser_child"], capture_output=True, text=True).stdout.split()
    return not out


# ---- scenarios -----------------------------------------------------------
@scenario("real_flow_download_parse_raw_complete_ack")
def s_happy(item):
    start_worker()
    state = done(item)
    assert state["status"] in SUCCESS, state
    return {"parser_executions": 1, "leases": 1, "retry_count": 0, "complete_calls": 1, "fail_calls": 0,
            "terminals": ["FINISHED:PARSE_SUCCEEDED"], "closures": []}


@scenario("recoverable_parse_timeout_kills_the_parser_and_the_retry_really_parses_again")
def s_timeout(item):
    start_worker("worker-impatient", parse_timeout=1.0)
    wait_for(lambda: FAULTS.count("claim", job=item["job_id"], status="claimed") == 1, 60, "the first lease")
    # The impatient worker would also take the retry and time out again; keep it
    # away from the queue so the retry goes to a worker that can finish.
    FAULTS.arm("claim", "before", worker="worker-impatient", times=9999)
    wait_for(lambda: job(item["job_id"])["retry_count"] == 1, 240, "the timed out dispatch to be retried")
    assert wait_for(no_parser_process, 20, "the timed out parser process to be gone")
    start_worker("worker-patient")
    state = done(item)
    assert state["status"] in SUCCESS, state
    return {"parser_executions": 2, "execution_identities": 2, "retry_count": 1, "fail_calls": 1, "complete_calls": 1,
            "terminals": ["FAILED:PARSE_TIMEOUT", "FINISHED:PARSE_SUCCEEDED"], "closures": []}


@scenario("a_parse_that_always_times_out_stops_at_the_retry_limit_with_a_real_execution_each")
def s_timeout_exhausted(item):
    start_worker(parse_timeout=1.0)
    state = done(item, 300)
    assert state["status"] == "failed" and state["error_code"] == "PARSER_TIMEOUT", state
    assert wait_for(no_parser_process, 20, "no parser process left")
    return {"parser_executions": 3, "execution_identities": 3, "retry_count": 3, "fail_calls": 3, "complete_calls": 0,
            "terminals": ["FAILED:PARSE_TIMEOUT"] * 3, "raw_artifacts": 0}


@scenario("sigkill_during_parse_is_reconciled_and_reexecuted_under_a_new_identity")
def s_sigkill(item):
    worker = start_worker()
    wait_for(lambda: has_event(item["job_id"], "EXECUTION_STARTED"), 240, "the parse to start")
    time.sleep(1.5)
    kill_worker(worker)
    assert wait_for(no_parser_process, 20, "the killed worker's parser child to be gone")
    assert job(item["job_id"])["status"] == "processing"
    expire_lease(item["job_id"])
    start_worker()
    state = done(item)
    assert state["status"] in SUCCESS, state
    return {"parser_executions": 2, "execution_identities": 2, "retry_count": 1, "complete_calls": 1,
            "closures": [{"dispatch": 0, "reason": "abandoned_execution", "lifecycle": "STARTED", "deliveries": 2, "retried": True}]}


@scenario("completion_lost_before_commit_is_reexecuted_and_reuses_the_raw_artifact")
def s_complete_lost(item):
    start_worker()
    FAULTS.arm("complete", "before")
    wait_for(lambda: has_event(item["job_id"], "EXECUTION_FINISHED"), 420, "the FINISHED terminal")
    time.sleep(3)
    before = facts(item)
    assert before["job_status"] == "processing" and before["raw_status"] == "ready", before
    expire_lease(item["job_id"])
    state = done(item)
    assert state["status"] in SUCCESS, state
    after = facts(item)
    assert after["raw_chunks"] == before["raw_chunks"] and after["raw_objects"] == before["raw_objects"], (before, after)
    return {"parser_executions": 2, "execution_identities": 2, "retry_count": 1, "raw_artifacts": 1,
            "closures": [{"dispatch": 0, "reason": "abandoned_execution", "lifecycle": "FINISHED", "deliveries": 2, "retried": True}]}


@scenario("acknowledgement_lost_after_commit_changes_nothing")
def s_ack_lost(item):
    start_worker()
    FAULTS.arm("complete", "after")
    state = done(item)
    assert state["status"] in SUCCESS, state
    time.sleep(4)
    return {"parser_executions": 1, "leases": 1, "retry_count": 0, "closures": []}


@scenario("failure_report_lost_is_reconciled_as_retryable_and_the_retry_parses")
def s_fail_lost(item):
    start_worker(parse_timeout=1.0)
    FAULTS.arm("fail", "before")
    wait_for(lambda: has_event(item["job_id"], "EXECUTION_FAILED"), 240, "the FAILED terminal")
    time.sleep(3)
    assert job(item["job_id"])["status"] == "processing"
    stop_workers()
    expire_lease(item["job_id"])
    start_worker()
    state = done(item)
    assert state["status"] in SUCCESS, state
    return {"parser_executions": 2, "execution_identities": 2, "retry_count": 1,
            "terminals": ["FAILED:PARSE_TIMEOUT", "FINISHED:PARSE_SUCCEEDED"]}


@scenario("raw_chunk_upload_lost_before_storage_commit_fails_the_dispatch_and_the_retry_completes")
def s_raw_before(item):
    start_worker()
    FAULTS.arm("storage-upload", "before")
    state = done(item)
    assert state["status"] in SUCCESS, state
    return {"parser_executions": 2, "execution_identities": 2, "retry_count": 1, "fail_calls": 1, "complete_calls": 1,
            "raw_artifacts": 1}


@scenario("raw_chunk_stored_but_answer_lost_fails_the_dispatch_and_the_retry_rewrites_without_duplicates")
def s_raw_after(item):
    start_worker()
    FAULTS.arm("storage-upload", "after")
    state = done(item)
    assert state["status"] in SUCCESS, state
    return {"parser_executions": 2, "execution_identities": 2, "retry_count": 1, "fail_calls": 1, "complete_calls": 1,
            "raw_artifacts": 1}


@scenario("stale_worker_that_lost_its_lease_cannot_write_raw_or_complete")
def s_stale(item):
    old = start_worker("worker-old")
    FAULTS.arm("heartbeat", "before", worker="worker-old", times=999)
    wait_for(lambda: has_event(item["job_id"], "EXECUTION_STARTED"), 240, "the parse to start")
    expire_lease(item["job_id"])
    start_worker("worker-new")
    state = done(item)
    assert state["status"] in SUCCESS, state
    wait_for(lambda: has_event(item["job_id"], "EXECUTION_STARTED", 2), 5, "two executions")
    time.sleep(8)
    assert old["process"].poll() is None
    accepted = [c for c in FAULTS.calls if c.get("worker") == "worker-old" and c["point"] in ("complete", "fail")
                and (c.get("status") in SUCCESS or c.get("accepted") is True)]
    assert not accepted, accepted
    old["killed"] = True  # still running its own parse; exempt from the leftover-file check
    return {"execution_identities": 2, "retry_count": 1, "raw_artifacts": 1,
            "closures": [{"dispatch": 0, "reason": "abandoned_execution", "lifecycle": "STARTED", "deliveries": 2, "retried": True}]}


@scenario("three_workers_one_job_one_lease_one_execution")
def s_concurrency(item):
    for index in range(3):
        start_worker(f"worker-{index}")
    state = done(item)
    assert state["status"] in SUCCESS, state
    time.sleep(3)
    return {"parser_executions": 1, "leases": 1, "complete_calls": 1}


@scenario("heartbeats_renew_the_lease_during_a_real_parse")
def s_heartbeat(item):
    start_worker(heartbeat=1.0)
    state = done(item)
    assert state["status"] in SUCCESS, state
    assert facts(item)["heartbeats"] >= 2, facts(item)["heartbeats"]
    return {"parser_executions": 1, "leases": 1}


@scenario("undecidable_reconciliation_ends_in_an_explicit_terminal_and_manual_retry_recovers")
def s_undecidable(item):
    worker = start_worker()
    wait_for(lambda: has_event(item["job_id"], "EXECUTION_STARTED"), 240, "the parse to start")
    kill_worker(worker)
    FAULTS.arm("reconcile", "before", times=99)
    start_worker()
    for expected in (2, 3):
        expire_lease(item["job_id"])
        wait_for(lambda: job(item["job_id"])["delivery_count"] == expected, 60, f"delivery {expected}")
        time.sleep(1.5)
    expire_lease(item["job_id"])
    state = done(item, 60)
    assert state["status"] == "failed" and state["error_code"] == "JOB_STALE", state
    assert "delivery_limit" in (state["error_message"] or ""), state
    stalled = facts(item)
    assert stalled["queued_messages"] == 0 and stalled["parser_executions"] == 1, stalled
    assert stalled["closures"] == [{"dispatch": 0, "reason": "delivery_limit", "lifecycle": None, "deliveries": 3, "retried": False}], stalled
    # Explicit, recorded, recoverable: the existing retry opens a new dispatch that really executes.
    FAULTS.clear()
    retried = js(f"select public.retry_demo_job('{item['job_id']}','{item['user_id']}', true, 'admin_e2e')")
    assert retried["queued"] is True, retried
    final = done(item)
    assert final["status"] in SUCCESS, final
    return {"parser_executions": 2, "execution_identities": 2}


@scenario("sigkill_during_download_leaves_the_job_recoverable")
def s_kill_download(item):
    worker = start_worker()
    FAULTS.arm("demo-download", "stream", "kill", pid=worker["process"].pid, after_bytes=8 * 1024 * 1024)
    worker["process"].wait(timeout=120)
    worker["killed"] = True
    left = sorted(p.name for p in worker["tmp"].rglob("demo-*.dem"))
    expire_lease(item["job_id"])
    start_worker()
    state = done(item)
    assert state["status"] in SUCCESS, state
    seen = facts(item)
    seen_identities = seen["execution_identities"]
    assert seen["parser_executions"] == 1, seen
    RESULTS_NOTES["partial_demo_left_by_sigkill_during_download"] = len(left)
    return {"parser_executions": 1, "execution_identities": seen_identities}


RESULTS_NOTES: dict = {}
SCENARIOS = [s_happy, s_timeout, s_timeout_exhausted, s_sigkill, s_complete_lost, s_ack_lost, s_fail_lost, s_raw_before, s_raw_after,
             s_stale, s_concurrency, s_heartbeat, s_undecidable, s_kill_download]


def main() -> int:
    global FIXTURE_PATH, FIXTURE, API_EDGE, BRIDGE_EDGE_PORT
    only = sys.argv[1] if len(sys.argv) > 1 else None
    FIXTURE_PATH, FIXTURE = acquire_fixture()
    private_bucket(STACK["api"], STACK["key"], "cs2-raw-evidence")
    API_EDGE = ApiEdge(FAULTS, 54321, WORK)
    _, api_port = API_EDGE.serve()
    bridge, bridge_port = start_bridge(api_port, API_EDGE.cert)
    _, BRIDGE_EDGE_PORT = BridgeEdge(FAULTS, bridge_port).serve()
    assert durable_execution_id("a", 1, "b", 1) != durable_execution_id("a", 1, "b", 0)
    try:
        for run in SCENARIOS:
            if only and only != run.__name__:
                continue
            run()
            if RESULTS and RESULTS[-1]["status"] != "PASS" and os.environ.get("QUEUE_E2E_STOP_ON_FAIL") == "1":
                break
    finally:
        stop_workers()
        kill_group(bridge.pid)
    ok = bool(RESULTS) and all(item["status"] == "PASS" for item in RESULTS)
    print(json.dumps({
        "probe": "DEMO_PARSE_RECOVERY_END_TO_END",
        "status": "PASS" if ok else "FAIL",
        "database": "LOCAL_DISPOSABLE_SUPABASE_STACK_ONLY",
        "worker": "PRODUCTION_ENTRYPOINT_UVICORN_APP_REAL_DOWNLOAD_PARSE_RAW",
        "bridge": "APPLICATION_ROUTE_HANDLERS_WITH_SUPABASE_JS_NODE_ENV_TEST",
        "demo": {"fixture": FIXTURE["filename"], "sha256": FIXTURE["sha256"], "bytes": FIXTURE["bytes"], "public_fixture_only": True},
        "pgmq_version": sql("select extversion from pg_extension where extname='pgmq'"),
        "postgres_version": sql("show server_version"),
        "delivery_semantics": "AT_LEAST_ONCE_EXECUTION_WITH_AT_MOST_ONE_COMMITTED_RESULT_PER_JOB",
        "exactly_once_execution": "NOT_CLAIMED",
        "notes": RESULTS_NOTES,
        "scenarios": RESULTS,
    }, indent=1, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
