"""Runs the PRODUCTION durable consumer loop against the loopback bridge.

Real: worker.durable_consumer_loop, its claim/heartbeat/fail/complete/reconcile
protocol, the ExecutionRecorder and the execution identity.
Replaced: app._parse_durable_request (download, demoparser2, RAW chunking) by a
scripted step, so the harness decides how each parser execution ends.

usage: harness_worker.py <services/cs2-demo-parser dir> <bridge url> <worker id> <state dir>
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

services, bridge_url, worker_id, state_dir = sys.argv[1], sys.argv[2], sys.argv[3], Path(sys.argv[4])
if not bridge_url.startswith("http://127.0.0.1:"):
    raise SystemExit("RECOVERY_HARNESS_IS_LOOPBACK_ONLY")
sys.path.insert(0, services)
os.environ["PARSER_SKIP_BOOTSTRAP"] = "1"  # no HTTP app: only the consumer loop runs here

import app  # noqa: E402
import worker  # noqa: E402
import h3e91_execution  # noqa: E402
from errors import WorkerError  # noqa: E402

# This harness exercises the real consumer loop without building a Docker image.
# Supply a deterministic embedded image identity, as the Docker build does, so
# execution recording reaches the loopback bridge instead of failing closed.
h3e91_execution.image_build_identity = lambda: {
    "commit": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "embedded": True,
    "source": "build-arg",
}
from settings import Settings  # noqa: E402


def next_ordinal(job_id: str) -> int:
    """Parser executions of a job, counted across worker processes."""
    path = state_dir / f"{job_id}.executions"
    count = int(path.read_text()) + 1 if path.exists() else 1
    path.write_text(str(count))
    return count


async def scripted(body, _settings, _parse, *, job_id, user_id, attempt_number, bridge, client, on_started=None, cleanup_dirs=None):
    plan = json.loads((state_dir / "plan.json").read_text())
    if on_started is not None:
        await on_started()
    ordinal = next_ordinal(job_id)
    step = plan.get(f"{job_id}:{ordinal}") or plan.get(str(ordinal)) or plan.get("default") or {}
    (state_dir / f"{job_id}.checkpoint").write_text(json.dumps({"ordinal": ordinal, "pid": os.getpid()}))
    outcome = step.get("outcome", "ok")
    if outcome == "hang":
        await asyncio.sleep(3600)
    await asyncio.sleep(float(step.get("parse_seconds", 0.05)))
    if outcome.startswith("worker_error:"):
        raise WorkerError(500, outcome.split(":", 1)[1], "scripted parser failure")
    if outcome == "raw_failure_before_commit":
        raise RuntimeError("RAW_CHUNK_TOO_LARGE")
    raw = await bridge("raw-commit", {})
    if outcome == "raw_failure_after_commit":
        raise RuntimeError("RAW_FINALIZE_FAILED")
    return {"hot": {"execution_ordinal": ordinal},
            "raw": {"artifact_id": raw["artifact_id"], "root_digest": raw["root_digest"],
                    "total_chunks": 1, "total_bytes": 1}}


app._parse_durable_request = scripted

settings = Settings(
    token="recovery-harness", revision="git:" + "b" * 40, build_revision=None, contract_version=1,
    environment="test", max_demo_bytes=1024 * 1024, max_payload_bytes=1024 * 1024,
    download_timeout_seconds=5.0, parse_timeout_seconds=5.0, bridge_url=bridge_url,
    bridge_secret="recovery-harness-loopback-only", worker_id=worker_id,
    queue_poll_seconds=0.05, queue_heartbeat_seconds=float(os.environ.get("HARNESS_HEARTBEAT_SECONDS", "0.2")),
)
asyncio.run(worker.durable_consumer_loop(settings, lambda _path: {}))
