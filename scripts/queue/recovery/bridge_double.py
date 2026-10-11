"""Loopback stand-in for the APP bridge, used only by the recovery harness.

What is REAL behind it: the queue functions (claim, heartbeat, fail, finalize,
abandon, stale sweep), pgmq, the demo_jobs/uploads rows and the H3E91 execution
ledger with its own writer and lifecycle reader, all in a disposable database.

What is a STAND-IN: the TypeScript bridge itself. `reconcile`, `fail` and
`complete` below follow src/lib/pipeline/durableBridge.server.ts decision for
decision; the TypeScript side is unit-tested on its own
(h3e91DurableReconciliation.test.ts). RAW chunking and the Canonical/HOT
persistence are replaced by two idempotent effect rows per job, which is
enough to count how many times a result was committed, and nothing more.

Faults are injected at exact protocol points: before or after the bridge
commits an action it can drop the connection (a lost request or a lost
acknowledgement) or SIGKILL the worker process (a real crash).
"""
from __future__ import annotations

import json
import os
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from queue_semantics_probe import js, sql  # noqa: E402

SECRET = "recovery-harness-loopback-only"
VISIBILITY_SECONDS = 60

# Mirror of classifyWorkerFailure/PERMANENT for the codes the worker can emit.
WORKER_TO_PIPELINE = {
    "UNAUTHORIZED": "PARSER_UNAUTHORIZED", "FORBIDDEN": "PARSER_FORBIDDEN",
    "CONTRACT_MISMATCH": "PARSER_CONTRACT_MISMATCH", "UNSUPPORTED_CONTRACT_VERSION": "PARSER_CONTRACT_MISMATCH",
    "SAFE_REPLAY_REQUIRES_RECONCILIATION": "PARSER_CONTRACT_MISMATCH",
    "INVALID_DEMO_FORMAT": "INVALID_DEMO_FORMAT", "CORRUPTED_DEMO": "CORRUPTED_DEMO",
    "UNSUPPORTED_DEMO": "UNSUPPORTED_DEMO", "HASH_MISMATCH": "PARSER_HASH_MISMATCH",
    "FILE_SIZE_MISMATCH": "PARSER_FILE_SIZE_MISMATCH", "DEMO_TOO_LARGE": "DEMO_TOO_LARGE",
    "PAYLOAD_TOO_LARGE": "PARSER_PAYLOAD_TOO_LARGE", "DOWNLOAD_ERROR": "PARSER_DOWNLOAD_ERROR",
    "DOWNLOAD_FAILED": "PARSER_DOWNLOAD_ERROR", "TIMEOUT": "PARSER_TIMEOUT",
    "PARSE_TIMEOUT": "PARSER_TIMEOUT", "DOWNLOAD_TIMEOUT": "PARSER_TIMEOUT", "PARSER_ERROR": "PARSER_ERROR",
}
PERMANENT = {
    "PARSER_UNAUTHORIZED", "PARSER_FORBIDDEN", "PARSER_CONTRACT_MISMATCH", "INVALID_DEMO_FORMAT",
    "CORRUPTED_DEMO", "UNSUPPORTED_DEMO", "PARSER_HASH_MISMATCH", "PARSER_FILE_SIZE_MISMATCH",
    "DEMO_TOO_LARGE", "PARSER_PAYLOAD_TOO_LARGE",
}


def classify(code: str) -> tuple[str, bool]:
    mapped = WORKER_TO_PIPELINE.get(code, "PARSER_ERROR")
    return mapped, mapped in PERMANENT


def lit(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def install_effects_schema() -> None:
    sql("create schema if not exists queue_probe")
    sql("create table if not exists queue_probe.effects(job_id uuid not null, kind text not null, "
        "dispatch_attempt integer not null, committed_at timestamptz not null default now(), primary key(job_id, kind))")
    sql("create table if not exists queue_probe.effect_attempts(id bigint generated always as identity primary key, "
        "job_id uuid not null, kind text not null, dispatch_attempt integer not null, inserted boolean not null)")


class Drop(Exception):
    """Close the connection without a response."""


class BridgeDouble:
    def __init__(self, protocol: str, execution_id) -> None:
        if protocol not in ("recovery", "legacy"):
            raise ValueError(protocol)
        self.protocol = protocol
        self.execution_id = execution_id  # the worker tree's own identity function
        self.faults: list[dict] = []
        self.calls: list[dict] = []
        self.lock = threading.Lock()

    # ---- fault injection -------------------------------------------------
    def arm(self, point: str, when: str, action: str, *, pid: int | None = None, job: str | None = None,
            times: int = 1) -> None:
        assert when in ("before", "mid", "after") and action in ("drop", "kill")
        with self.lock:
            self.faults.append({"point": point, "when": when, "action": action, "pid": pid, "job": job, "left": times})

    def _fault(self, point: str, when: str, job: str | None) -> None:
        with self.lock:
            hit = next((f for f in self.faults if f["point"] == point and f["when"] == when and f["left"] > 0
                        and (f["job"] is None or f["job"] == job)), None)
            if hit:
                hit["left"] -= 1
        if not hit:
            return
        if hit["action"] == "kill":
            os.kill(hit["pid"], signal.SIGKILL)
        raise Drop()

    # ---- actions ---------------------------------------------------------
    def _args(self, body: dict) -> str:
        return f"{lit(body['jobId'])}, {int(body['messageId'])}, {int(body['attempt'])}, {lit(body['workerId'])}"

    def claim(self, body: dict) -> dict:
        data = js(f"select public.claim_demo_parse_message({lit(body['workerId'])}, {VISIBILITY_SECONDS}, 1)")
        if data.get("status") != "claimed":
            return data
        return {key: data[key] for key in ("status", "message_id", "job_id", "upload_id", "user_id", "demo_sha256",
                                           "attempt", "attempt_number", "schema_version", "file_size")} | {
            "demo_url": "https://recovery-harness.invalid/demo.dem", "visibility_seconds": VISIBILITY_SECONDS}

    def heartbeat(self, body: dict, stage: str | None = None) -> dict:
        return js(f"select public.heartbeat_demo_parse_message({self._args(body)}, {VISIBILITY_SECONDS}, "
                  f"{lit(stage or body.get('stage'))})")

    def _current(self, body: dict) -> dict | None:
        row = sql("select to_jsonb(j) from (select status, upload_id, attempt_number, dispatch_attempt from public.demo_jobs "
                  f"where id={lit(body['jobId'])} and queue_message_id={int(body['messageId'])} "
                  f"and dispatch_attempt={int(body['attempt'])} and worker_id={lit(body['workerId'])} "
                  "and lease_expires_at > now()) j")
        return json.loads(row) if row else None

    def _effect(self, job_id: str, kind: str, dispatch: int) -> bool:
        inserted = sql("with ins as (insert into queue_probe.effects(job_id, kind, dispatch_attempt) "
                       f"values ({lit(job_id)}, {lit(kind)}, {dispatch}) on conflict do nothing returning 1) "
                       "select count(*) from ins") == "1"
        sql("insert into queue_probe.effect_attempts(job_id, kind, dispatch_attempt, inserted) "
            f"values ({lit(job_id)}, {lit(kind)}, {dispatch}, {lit(inserted)})")
        return inserted

    def raw_commit(self, body: dict) -> dict:
        """Stand-in for the RAW artifact: one row per job, as raw_evidence_artifacts_job_unique."""
        current = self._current(body)
        if not current:
            raise PermissionError("JOB_STALE")
        self._effect(body["jobId"], "raw", int(body["attempt"]))
        return {"artifact_id": body["jobId"], "root_digest": "0" * 64}

    def complete(self, body: dict) -> dict:
        heartbeat = self.heartbeat(body, "persisting")
        if heartbeat.get("accepted") is not True or heartbeat.get("cancelled") is True:
            return {"status": "cancelled" if heartbeat.get("cancelled") is True else "stale"}
        # Stand-in for processJob: the observation is committed once per job and
        # the job reaches its terminal status in the same statement batch.
        self._effect(body["jobId"], "observation", int(body["attempt"]))
        sql("update public.demo_jobs set status='processed', stage='completed', finished_at=now() "
            f"where id={lit(body['jobId'])} and status='processing'")
        sql(f"update public.uploads set status='processed' where id=(select upload_id from public.demo_jobs where id={lit(body['jobId'])})")
        self._fault("complete", "mid", body["jobId"])
        queue = js(f"select public.finalize_demo_parse_message({self._args(body)})")
        return {"status": "processed", "queue": queue}

    def fail(self, body: dict) -> dict:
        code, permanent = classify(str(body.get("errorCode")))
        return js(f"select public.fail_demo_parse_message({self._args(body)}, {lit(code)}, "
                  f"{lit(str(body.get('detail') or '')[:300] or None)}, {lit(permanent)})")

    def lifecycle(self, execution_id: str) -> dict:
        return js(f"select public.h3e91_read_execution_lifecycle({lit(execution_id)})")

    def reconcile(self, body: dict) -> dict:
        row = sql("select to_jsonb(j) from (select status, queue_message_id, dispatch_attempt, worker_id, upload_id, "
                  f"attempt_number from public.demo_jobs where id={lit(body['jobId'])}) j")
        job = json.loads(row) if row else None
        if (not job or job["queue_message_id"] != body["messageId"] or job["dispatch_attempt"] != body["attempt"]
                or job["worker_id"] != body["workerId"]
                or self.execution_id(body["jobId"], job["attempt_number"], job["upload_id"], job["dispatch_attempt"])
                != body["executionId"]):
            return {"status": "reconciliation_required", "lifecycle": "UNKNOWN"}
        state = self.lifecycle(body["executionId"])
        name = state["lifecycle"]
        if name in ("INVALID", "NONE"):
            return {"status": "reconciliation_required", "lifecycle": name}
        abandonable = name in ("INTENT_ONLY", "STARTED") or (name == "FINISHED" and job["status"] == "processing")
        if abandonable:
            if self.protocol == "legacy":
                return {"status": "reconciliation_required", "lifecycle": name}
            data = js(f"select public.abandon_demo_parse_dispatch({self._args(body)}, {lit(name)})")
            if data.get("accepted") is not True:
                return {"status": "reconciliation_required", "lifecycle": name}
            return {"status": "dispatch_abandoned", "lifecycle": name, "queue": data}
        if name == "FINISHED":
            effects = int(sql(f"select count(*) from queue_probe.effects where job_id={lit(body['jobId'])}"))
            if job["status"] != "processed" or effects != 2:
                return {"status": "reconciliation_required", "lifecycle": "FINISHED"}
            data = js(f"select public.finalize_demo_parse_message({self._args(body)})")
            if data.get("acknowledged") is not True:
                return {"status": "reconciliation_required", "lifecycle": "FINISHED"}
            return {"status": "queue_reconciled", "lifecycle": "FINISHED", "queue": data}
        outcome = state.get("terminalOutcome") or f"EXECUTION_{name}"
        permanent = (name == "FAILED") if self.protocol == "legacy" else classify(outcome)[1]
        data = js(f"select public.fail_demo_parse_message({self._args(body)}, {lit(outcome)}, "
                  f"'Authoritative execution terminal reconciled without parser replay.', {lit(permanent)})")
        if data.get("accepted") is not True:
            return {"status": "reconciliation_required", "lifecycle": name}
        return {"status": "queue_reconciled", "lifecycle": name, "queue": data}

    def event(self, body: dict) -> tuple[int, dict]:
        data = js("select public.h3e91_record_execution_event("
                  f"{lit(body['eventId'])}, {lit(body['executionId'])}, {lit(body['eventType'])}, {lit(body['uploadId'])}, "
                  f"{lit(body['correlationId'])}, {lit(body['jobId'])}, {lit(body['attemptNumber'])}, {lit(body['demoSha256'])}, "
                  f"{lit(body['fileSize'])}, {lit(body['parserName'])}, {lit(body['parserVersion'])}, {lit(body['parserRevision'])}, "
                  f"{lit(body['executionSurface'])}, {lit(body['source'])}, {lit(body['metadataDigest'])}, "
                  f"{lit(body['outcomeCode'])}, {int(body['eventVersion'])})")
        status = data.get("status")
        return (201 if status == "INSERTED" else 200 if status == "IDEMPOTENT_REPLAY" else 409), data

    # ---- transport -------------------------------------------------------
    def dispatch(self, path: str, body: dict) -> tuple[int, dict]:
        if path.endswith("/h3e91-execution-event"):
            point, job = f"event:{body.get('eventType')}", body.get("jobId")
            self._fault(point, "before", job)
            answer = self.event(body)
        elif path.endswith("/h3e91-execution-lifecycle"):
            point, job = "lifecycle", None
            answer = (200, self.lifecycle(body["executionId"]))
        else:
            point, job = path.rsplit("/", 1)[-1], body.get("jobId")
            self._fault(point, "before", job)
            handler = {"claim": self.claim, "heartbeat": self.heartbeat, "complete": self.complete,
                       "fail": self.fail, "reconcile": self.reconcile, "raw-commit": self.raw_commit}[point]
            answer = (200, handler(body))
            if point == "claim" and answer[1].get("status") == "claimed":
                job = answer[1]["job_id"]
        with self.lock:
            self.calls.append({"point": point, "job": job, "worker": body.get("workerId"),
                               "status": answer[1].get("status") if isinstance(answer[1], dict) else None})
        self._fault(point, "after", job)
        return answer

    def serve(self) -> tuple[ThreadingHTTPServer, str]:
        double = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args) -> None:  # silence
                return

            def do_POST(self) -> None:  # noqa: N802
                try:
                    if self.headers.get("authorization") != f"Bearer {SECRET}":
                        self.send_response(401); self.end_headers(); return
                    body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"{}")
                    status, payload = double.dispatch(self.path, body)
                    data = json.dumps(payload).encode()
                    self.send_response(status)
                    self.send_header("content-type", "application/json")
                    self.send_header("content-length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except Drop:
                    self.close_connection = True
                    try:
                        self.connection.shutdown(2)
                    except OSError:
                        pass
                except PermissionError:
                    self.send_response(409); self.end_headers()
                except Exception:  # noqa: BLE001 - the worker must see a server error
                    try:
                        self.send_response(500); self.end_headers()
                    except OSError:
                        pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server, f"http://127.0.0.1:{server.server_address[1]}/api/public/pipeline-worker"
