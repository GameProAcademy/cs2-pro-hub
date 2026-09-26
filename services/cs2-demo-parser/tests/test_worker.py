from __future__ import annotations

import asyncio

from conftest import DEMO_SHA, empty_parse, make_settings
from errors import WorkerError
from h3e91_execution import ExecutionRecorder
from worker import _worker_error_code, durable_consumer_loop


def _synthetic_execution_recorder(monkeypatch):
    async def record(_self, _event_type, _outcome_code=None):
        return {"status": "INSERTED"}
    monkeypatch.setattr(ExecutionRecorder, "record", record)


def test_worker_error_preserves_wire_code():
    assert _worker_error_code(WorkerError(422, "HASH_MISMATCH", "safe")) == "HASH_MISMATCH"


def test_consumer_claims_heartbeats_and_completes(monkeypatch, tmp_path):
    _synthetic_execution_recorder(monkeypatch)
    calls: list[tuple[str, dict]] = []
    durable_kwargs = {}
    demo = tmp_path / "demo.dem"
    demo.write_bytes(b"PBDEMS2\x00" + b"x" * 64)

    async def download(_url, _size, _settings):
        return str(demo), DEMO_SHA, 520

    async def bridge(_client, _settings, action, body):
        calls.append((action, body))
        if action == "claim":
            if sum(1 for name, _ in calls if name == "claim") > 1:
                raise asyncio.CancelledError()
            return {
                "status": "claimed", "job_id": "11111111-1111-1111-1111-111111111111",
                "message_id": 7, "attempt": 0, "upload_id": "22222222-2222-2222-2222-222222222222",
                 "user_id": "33333333-3333-3333-3333-333333333333", "attempt_number": 7,
                "demo_url": "https://storage.example/demo.dem", "demo_sha256": DEMO_SHA,
                "file_size": 520, "schema_version": 1,
            }
        if action == "heartbeat":
            return {"accepted": True, "cancelled": False}
        if action == "complete":
            return {"status": "processed"}
        return {}

    import app
    import worker

    async def durable(*_args, **kwargs):
        durable_kwargs.update(kwargs)
        return {"hot": {"schema_version": 1}, "raw": {"artifact_id": "artifact", "root_digest": DEMO_SHA}}

    monkeypatch.setattr(app, "_download", download)
    monkeypatch.setattr(app, "_parse_durable_request", durable)
    monkeypatch.setattr(worker, "_bridge", bridge)
    settings = make_settings(
        bridge_url="https://app.example/api/public/pipeline-worker",
        bridge_secret="bridge-test-secret",
    )
    try:
        asyncio.run(durable_consumer_loop(settings, empty_parse))
    except asyncio.CancelledError:
        pass

    assert [name for name, _ in calls][:3] == ["claim", "heartbeat", "complete"]
    completed = calls[2][1]
    assert completed["messageId"] == 7
    assert completed["attempt"] == 0
    assert durable_kwargs["attempt_number"] == 7
    assert "demo_url" not in completed
    assert "result" not in completed
    assert "hot" in completed and "raw" in completed
    assert "bridge-test-secret" not in str(calls)


def test_consumer_uses_parser_contract_not_queue_schema_version(monkeypatch, tmp_path):
    calls: list[tuple[str, dict]] = []
    demo = tmp_path / "demo.dem"
    demo.write_bytes(b"PBDEMS2\x00" + b"x" * 64)

    async def download(_url, _size, _settings):
        return str(demo), DEMO_SHA, 520

    async def bridge(_client, _settings, action, body):
        calls.append((action, body))
        if action == "claim":
            if sum(1 for name, _ in calls if name == "claim") > 1:
                raise asyncio.CancelledError()
            return {"status": "claimed", "job_id": "11111111-1111-1111-1111-111111111111",
                    "message_id": 9, "attempt": 0, "upload_id": "22222222-2222-2222-2222-222222222222",
                    "user_id": "33333333-3333-3333-3333-333333333333", "attempt_number": 1,
                    "demo_url": "https://storage.example/demo.dem", "demo_sha256": DEMO_SHA,
                    "file_size": 520, "schema_version": 999}
        if action == "heartbeat":
            return {"accepted": True, "cancelled": False}
        return {"status": "processed"}

    import app
    import worker
    async def durable(*_args, **_kwargs):
        return {"hot": {"schema_version": 1}, "raw": {"artifact_id": "artifact", "root_digest": DEMO_SHA}}
    monkeypatch.setattr(app, "_download", download)
    monkeypatch.setattr(app, "_parse_durable_request", durable)
    monkeypatch.setattr(worker, "_bridge", bridge)
    settings = make_settings(bridge_url="https://app.example/api/public/pipeline-worker",
                             bridge_secret="bridge-test-secret")
    try:
        asyncio.run(durable_consumer_loop(settings, empty_parse))
    except asyncio.CancelledError:
        pass
    assert any(name == "complete" for name, _ in calls)


def test_consumer_suppresses_completion_after_rejected_final_heartbeat(monkeypatch, tmp_path):
    calls: list[tuple[str, dict]] = []
    demo = tmp_path / "demo.dem"
    demo.write_bytes(b"PBDEMS2\x00" + b"x" * 64)

    async def download(_url, _size, _settings):
        return str(demo), DEMO_SHA, 520

    async def bridge(_client, _settings, action, body):
        calls.append((action, body))
        if action == "claim":
            if sum(1 for name, _ in calls if name == "claim") > 1:
                raise asyncio.CancelledError()
            return {"status": "claimed", "job_id": "11111111-1111-1111-1111-111111111111",
                    "message_id": 11, "attempt": 2, "upload_id": "22222222-2222-2222-2222-222222222222",
                    "user_id": "33333333-3333-3333-3333-333333333333", "attempt_number": 2,
                    "demo_url": "https://storage.example/demo.dem", "demo_sha256": DEMO_SHA,
                    "file_size": 520, "schema_version": 1}
        if action == "heartbeat":
            return {"accepted": False, "cancelled": False}
        return {}

    import app
    import worker
    async def durable(*_args, **_kwargs):
        return {"hot": {"schema_version": 1}, "raw": {"artifact_id": "artifact", "root_digest": DEMO_SHA}}
    monkeypatch.setattr(app, "_download", download)
    monkeypatch.setattr(app, "_parse_durable_request", durable)
    monkeypatch.setattr(worker, "_bridge", bridge)
    settings = make_settings(bridge_url="https://app.example/api/public/pipeline-worker",
                             bridge_secret="bridge-test-secret")
    try:
        asyncio.run(durable_consumer_loop(settings, empty_parse))
    except asyncio.CancelledError:
        pass
    assert "complete" not in [name for name, _ in calls]


def test_consumer_reports_worker_error_without_completion(monkeypatch, tmp_path):
    calls: list[tuple[str, dict]] = []
    demo = tmp_path / "demo.dem"
    demo.write_bytes(b"PBDEMS2\x00" + b"x" * 64)

    async def download(_url, _size, _settings):
        return str(demo), DEMO_SHA, 520

    async def bridge(_client, _settings, action, body):
        calls.append((action, body))
        if action == "claim":
            if sum(1 for name, _ in calls if name == "claim") > 1:
                raise asyncio.CancelledError()
            return {"status": "claimed", "job_id": "11111111-1111-1111-1111-111111111111",
                    "message_id": 12, "attempt": 0, "upload_id": "22222222-2222-2222-2222-222222222222",
                    "user_id": "33333333-3333-3333-3333-333333333333", "attempt_number": 1,
                    "demo_url": "https://storage.example/demo.dem", "demo_sha256": DEMO_SHA,
                    "file_size": 520, "schema_version": 1}
        return {"accepted": True, "cancelled": False}

    def rejected_parse(_path):
        raise WorkerError(422, "CORRUPTED_DEMO", "safe failure")

    import app
    import worker
    monkeypatch.setattr(app, "_download", download)
    monkeypatch.setattr(worker, "_bridge", bridge)
    settings = make_settings(bridge_url="https://app.example/api/public/pipeline-worker",
                             bridge_secret="bridge-test-secret")
    try:
        asyncio.run(durable_consumer_loop(settings, rejected_parse))
    except asyncio.CancelledError:
        pass
    names = [name for name, _ in calls]
    assert "fail" in names
    assert "complete" not in names