"""One execution identity per dispatch of a job (recovery protocol)."""
from __future__ import annotations

import asyncio
import uuid

import pytest

from conftest import empty_parse, make_settings

JOB = "11111111-1111-1111-1111-111111111111"
UPLOAD = "55555555-5555-5555-5555-555555555555"
# The same vectors are asserted by src/lib/pipeline/__tests__/h3e91DurableReconciliation.test.ts.
DISPATCH_ZERO = "e92a9a08-6268-5322-9678-5e9f4fea1f20"
DISPATCH_TWO = "bc77abbf-bd05-5091-b526-269c6bca2e16"


def test_dispatch_zero_keeps_the_identity_already_in_the_ledger():
    from worker import durable_execution_id

    legacy = str(uuid.uuid5(uuid.NAMESPACE_URL, f"h3e91:durable:{JOB}:1:{UPLOAD}"))
    assert durable_execution_id(JOB, 1, UPLOAD, 0) == legacy == DISPATCH_ZERO


def test_every_dispatch_is_a_distinct_execution_and_matches_the_bridge_vector():
    from worker import durable_execution_id

    identities = [durable_execution_id(JOB, 1, UPLOAD, dispatch) for dispatch in range(5)]
    assert len(set(identities)) == 5
    assert identities[2] == DISPATCH_TWO
    # A new logical attempt or another upload is never confused with a dispatch.
    assert durable_execution_id(JOB, 2, UPLOAD, 0) not in identities
    assert durable_execution_id(JOB, 1, JOB, 1) not in identities


@pytest.mark.parametrize("invalid", [-1, 1.0, "1", None, True])
def test_an_invalid_dispatch_attempt_is_refused(invalid):
    from worker import durable_execution_id

    with pytest.raises(RuntimeError):
        durable_execution_id(JOB, 1, UPLOAD, invalid)


def _run(monkeypatch, *, attempt, intent_status, reconcile=None):
    import app
    import worker
    from h3e91_execution import ExecutionRecorder

    seen = {"executions": [], "calls": [], "parsed": 0}

    async def record(self, event_type, outcome_code=None):
        seen["executions"].append((self.execution_id, event_type))
        return {"status": intent_status if event_type == "EXECUTION_INTENT" else "INSERTED"}

    async def bridge(_client, _settings, action, body):
        seen["calls"].append((action, body.get("executionId")))
        if action == "claim":
            if sum(1 for call in seen["calls"] if call[0] == "claim") > 1:
                raise asyncio.CancelledError()
            return {"status": "claimed", "job_id": JOB, "message_id": 9, "attempt": attempt, "upload_id": UPLOAD,
                    "user_id": "33333333-3333-3333-3333-333333333333", "attempt_number": 1,
                    "demo_url": "https://synthetic.invalid/demo.dem", "demo_sha256": "a" * 64,
                    "file_size": 520, "schema_version": 1}
        if action == "reconcile":
            return reconcile
        return {"accepted": True, "cancelled": False}

    async def durable(*_args, **kwargs):
        seen["parsed"] += 1
        await kwargs["on_started"]()
        return {"hot": {}, "raw": {"artifact_id": "x", "root_digest": "0" * 64}}

    monkeypatch.setattr(ExecutionRecorder, "record", record)
    monkeypatch.setattr(worker, "_bridge", bridge)
    monkeypatch.setattr(app, "_parse_durable_request", durable)
    settings = make_settings(bridge_url="https://synthetic.invalid/api/public/pipeline-worker",
                             bridge_secret="synthetic-test-only")
    try:
        asyncio.run(worker.durable_consumer_loop(settings, empty_parse))
    except asyncio.CancelledError:
        pass
    return seen


def test_a_counted_retry_runs_the_parser_under_its_own_identity(monkeypatch):
    seen = _run(monkeypatch, attempt=2, intent_status="INSERTED")
    assert seen["parsed"] == 1
    assert {execution for execution, _ in seen["executions"]} == {DISPATCH_TWO}
    assert [event for _, event in seen["executions"]] == ["EXECUTION_INTENT", "EXECUTION_STARTED", "EXECUTION_FINISHED"]
    assert [action for action, _ in seen["calls"]].count("complete") == 1


@pytest.mark.parametrize("answer", [
    {"status": "dispatch_abandoned", "lifecycle": "STARTED", "queue": {"accepted": True, "retry": True}},
    {"status": "queue_reconciled", "lifecycle": "FAILED"},
    {"status": "reconciliation_required", "lifecycle": "INVALID"},
])
def test_a_redelivery_of_the_same_dispatch_is_reconciled_and_never_parsed(monkeypatch, answer):
    seen = _run(monkeypatch, attempt=2, intent_status="IDEMPOTENT_REPLAY", reconcile=answer)
    assert seen["parsed"] == 0
    assert ("reconcile", DISPATCH_TWO) in seen["calls"]
    assert [event for _, event in seen["executions"]] == ["EXECUTION_INTENT"]
    assert not any(action in ("complete", "fail") for action, _ in seen["calls"])
