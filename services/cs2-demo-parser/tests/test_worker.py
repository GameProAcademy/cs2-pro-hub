from __future__ import annotations

import asyncio
from pathlib import Path

from conftest import DEMO_SHA, empty_parse, make_settings
from errors import WorkerError
from worker import _worker_error_code, durable_consumer_loop


def test_worker_error_preserves_wire_code():
    assert _worker_error_code(WorkerError(422, "HASH_MISMATCH", "safe")) == "HASH_MISMATCH"


def test_durable_entrypoint_uses_isolated_parser():
    entrypoint = Path(__file__).parents[1] / "worker_main.py"
    source = entrypoint.read_text(encoding="utf-8")
    assert "from parser_isolated import parse_demo_file_isolated" in source
    assert "durable_consumer_loop(settings, parse_demo_file_isolated)" in source
    assert "from parser import parse_demo_file" not in source


def test_worker_main_suppresses_http_request_url_logging():
    entrypoint = Path(__file__).parents[1] / "worker_main.py"
    source = entrypoint.read_text(encoding="utf-8")
    assert 'logging.getLogger("httpx").setLevel(logging.WARNING)' in source
    assert 'logging.getLogger("httpcore").setLevel(logging.WARNING)' in source


def test_consumer_claims_heartbeats_and_completes(monkeypatch, tmp_path):
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
            return {
                "status": "claimed", "job_id": "11111111-1111-1111-1111-111111111111",
                "message_id": 7, "attempt": 0, "upload_id": "22222222-2222-2222-2222-222222222222",
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

    monkeypatch.setattr(app, "_download", download)
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
    assert "demo_url" not in completed
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
                    "demo_url": "https://storage.example/demo.dem", "demo_sha256": DEMO_SHA,
                    "file_size": 520, "schema_version": 999}
        if action == "heartbeat":
            return {"accepted": True, "cancelled": False}
        return {"status": "processed"}

    import app
    import worker
    monkeypatch.setattr(app, "_download", download)
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
                    "demo_url": "https://storage.example/demo.dem", "demo_sha256": DEMO_SHA,
                    "file_size": 520, "schema_version": 1}
        if action == "heartbeat":
            return {"accepted": False, "cancelled": False}
        return {}

    import app
    import worker
    monkeypatch.setattr(app, "_download", download)
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
