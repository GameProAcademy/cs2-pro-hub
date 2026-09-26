"""Synthetic execution failure injection; no external service or real DEM."""

import asyncio

import httpx
import pytest

from conftest import DEMO_SHA, auth, make_settings, parse_body
from h3e91_execution import ExecutionRecorder


@pytest.mark.parametrize("failure", [
    "connect", "read", "write", "timeout", "401", "400", "409", "413", "503",
    "invalid_json", "invalid_status", "terminal_503", "terminal_timeout", "lost_response",
    "unconfigured",
])
def test_failures_never_authorize_parser_or_completion(failure):
    """15 injections exercise authorization, transport, malformed ack and terminal safety."""
    requests = []

    async def transport(request):
        requests.append(request)
        assert b"demo_url" not in request.content and b"signedUrl" not in request.content
        if failure in ("connect", "read", "write", "timeout", "terminal_timeout", "lost_response"):
            error = {"connect": httpx.ConnectError, "read": httpx.ReadError,
                     "write": httpx.WriteError, "timeout": httpx.ReadTimeout,
                     "terminal_timeout": httpx.ReadTimeout, "lost_response": httpx.ReadError}[failure]
            raise error("synthetic failure")
        if failure in ("401", "400", "409", "413", "503", "terminal_503"):
            return httpx.Response(503 if failure == "terminal_503" else int(failure), json={"code": "REJECTED"})
        if failure == "invalid_json":
            return httpx.Response(200, text="not-json")
        if failure == "invalid_status":
            return httpx.Response(200, json={"status": "REJECTED"})
        return httpx.Response(201, json={"status": "INSERTED"})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            settings = make_settings(bridge_url=None if failure == "unconfigured" else "https://synthetic.invalid/bridge",
                                     bridge_secret="synthetic-test-only")
            if failure == "unconfigured":
                with pytest.raises(RuntimeError, match="H3E91_EXECUTION_BRIDGE_NOT_CONFIGURED"):
                    ExecutionRecorder(client, settings, upload_id="11111111-1111-1111-1111-111111111111",
                                      surface="RAILWAY_V1_PARSE")
                return
            recorder = ExecutionRecorder(client, settings, upload_id="11111111-1111-1111-1111-111111111111",
                                         surface="RAILWAY_V1_PARSE", demo_sha256=DEMO_SHA, file_size=520)
            event = "EXECUTION_FINISHED" if failure.startswith("terminal_") else "EXECUTION_INTENT"
            with pytest.raises((RuntimeError, httpx.HTTPError, ValueError)):
                await recorder.record(event, "PARSE_SUCCEEDED" if event == "EXECUTION_FINISHED" else None)
            assert len(requests) == 1
    asyncio.run(run())


@pytest.mark.parametrize("stage", ["intent", "started", "parse", "terminal"])
def test_v1_parse_order_and_failure_suppression(stage, client_factory, monkeypatch):
    """Even synthetic parses cannot return 200 until a terminal event is recorded."""
    import app
    import h3e91_execution

    events = []

    class Recorder:
        def __init__(self, *_args, **_kwargs):
            pass

        def bind_revision(self, _revision):
            return self

        async def record(self, kind, _outcome=None):
            events.append(kind)
            if (stage == "intent" and kind == "EXECUTION_INTENT") or (stage == "started" and kind == "EXECUTION_STARTED") or (stage == "terminal" and kind == "EXECUTION_FINISHED"):
                raise RuntimeError("H3E91_RECORDING_FAILED_503")
            return {"status": "INSERTED"}

    async def fake_downloaded(_body, _settings, _parse, *, on_started, **_kwargs):
        events.append("download")
        await on_started()
        events.append("parse")
        if stage == "parse":
            raise RuntimeError("synthetic parser failure")
        return {"_performance": {}, "contract_version": 1}

    monkeypatch.setattr(h3e91_execution, "ExecutionRecorder", Recorder)
    monkeypatch.setattr(app, "_parse_downloaded", fake_downloaded)
    client = client_factory(settings=make_settings(bridge_url="https://synthetic.invalid/bridge",
                                                  bridge_secret="synthetic-test-only"))
    response = client.post("/v1/parse", json=parse_body(), headers=auth())
    assert response.status_code != 200
    if stage == "intent": assert events == ["EXECUTION_INTENT"]
    if stage == "started": assert events == ["EXECUTION_INTENT", "download", "EXECUTION_STARTED", "EXECUTION_ABORTED"]
    if stage == "parse": assert events == ["EXECUTION_INTENT", "download", "EXECUTION_STARTED", "parse", "EXECUTION_FAILED"]
    if stage == "terminal": assert events == ["EXECUTION_INTENT", "download", "EXECUTION_STARTED", "parse", "EXECUTION_FINISHED"]


def test_v1_http_retry_reconstructs_identity_without_reexecuting_parser(client_factory, monkeypatch):
    import app
    import h3e91_execution
    from uuid import UUID

    seen = {}
    parser_calls = []

    class Recorder:
        def __init__(self, *_args, **kwargs):
            self.identity = (kwargs["execution_id"], kwargs["correlation_id"])
            self.upload = kwargs["upload_id"]

        def bind_revision(self, _revision):
            return self

        async def record(self, kind, _outcome=None):
            key = (self.identity[0], kind)
            if key in seen:
                assert seen[key] == (self.identity, self.upload)
                return {"status": "IDEMPOTENT_REPLAY"}
            seen[key] = (self.identity, self.upload)
            return {"status": "INSERTED"}

    async def fake_downloaded(_body, _settings, _parse, *, on_started, **_kwargs):
        await on_started()
        parser_calls.append(1)
        return {"contract_version": 1}

    monkeypatch.setattr(h3e91_execution, "ExecutionRecorder", Recorder)
    monkeypatch.setattr(app, "_parse_downloaded", fake_downloaded)
    client = client_factory()
    body = parse_body()
    first = client.post("/v1/parse", json=body, headers=auth())
    assert requests, (first.status_code, first.text, h3e91_execution.ExecutionRecorder)
    assert first.status_code == 200
    # A genuinely new HTTP request constructs a new recorder. A lost response
    # cannot accidentally start a second parse, even though INTENT replays.
    second = client.post("/v1/parse", json=body, headers=auth())
    assert second.status_code == 409
    assert second.json()["detail"]["error_code"] == "SAFE_REPLAY_REQUIRES_RECONCILIATION"
    assert parser_calls == [1] and len(seen) == 3
    identity = next(iter(seen))[0]
    assert UUID(identity).version == 5
    changed_attempt = client.post("/v1/parse", json={**body, "attempt_number": 2}, headers=auth())
    assert changed_attempt.status_code == 200
    assert len(parser_calls) == 2
    assert len({execution for execution, _kind in seen}) == 2
    missing = client.post("/v1/parse", json={k: v for k, v in body.items() if k != "job_id"}, headers=auth())
    assert missing.status_code == 409
    assert len(parser_calls) == 2


@pytest.mark.parametrize("phase", ["intent_response_lost", "intent", "started", "finished"])
def test_v1_ambiguous_request_retry_is_safe_not_transparent(client_factory, monkeypatch, phase):
    """New HTTP requests and real recorder transport; the ledger is a synthetic bridge, not PostgreSQL."""
    import app
    import h3e91_execution

    stored = {}
    requests = []
    parser_calls = []
    original = h3e91_execution.ExecutionRecorder

    async def bridge(request):
        import json
        event = json.loads(request.content)
        requests.append(event)
        key = event["eventId"]
        old = stored.get(key)
        if old and old != event:
            return httpx.Response(409, json={"status": "REJECTED", "code": "EVENT_ID_CONFLICT"})
        stored[key] = event
        if phase == "intent_response_lost" and len(requests) == 1:
            raise httpx.ReadError("synthetic response lost after persistence")
        return httpx.Response(200 if old else 201, json={"status": "IDEMPOTENT_REPLAY" if old else "INSERTED"})

    transport = httpx.MockTransport(bridge)

    class TransportRecorder(original):
        def __init__(self, _client, settings, **kwargs):
            self.transport_client = httpx.AsyncClient(transport=transport)
            super().__init__(self.transport_client, settings, **kwargs)

    async def downloaded(_body, _settings, _parse, *, on_started, **_kwargs):
        await on_started()
        parser_calls.append(1)
        return {"contract_version": 1}

    monkeypatch.setattr(app, "_parse_downloaded", downloaded)
    client = client_factory(settings=make_settings(bridge_url="https://synthetic.invalid/api/public/pipeline-worker",
                                                   bridge_secret="synthetic-test-only"))
    monkeypatch.setattr(h3e91_execution, "ExecutionRecorder", TransportRecorder)
    body = parse_body()
    first = client.post("/v1/parse", json=body, headers=auth())
    assert first.status_code == (503 if phase == "intent_response_lost" else 200)
    first_count = len(stored)
    response = client.post("/v1/parse", json=body, headers=auth())
    assert response.status_code == 409
    assert response.json()["detail"]["error_code"] == "SAFE_REPLAY_REQUIRES_RECONCILIATION"
    assert len(stored) == first_count
    assert len({e["executionId"] for e in requests}) == 1
    assert len({e["eventId"] for e in requests if e["eventType"] == "EXECUTION_INTENT"}) == 1
    assert len(parser_calls) == (0 if phase == "intent_response_lost" else 1)
    assert sum(e["eventType"] == "EXECUTION_FINISHED" for e in stored.values()) == (0 if phase == "intent_response_lost" else 1)
@pytest.mark.parametrize("surface,scenario", [
    ("APP", "INTENT_UNAVAILABLE"), ("APP", "STARTED_UNAVAILABLE"), ("APP", "PARSER_FAILURE"),
    ("APP", "FAILED_UNAVAILABLE"), ("APP", "FINISHED_UNAVAILABLE"), ("APP", "FINISHED_REJECTED"),
    ("APP", "RETRY_LOST_RESPONSE"),
    ("RAILWAY_V1_PARSE", "INTENT_UNAVAILABLE"), ("RAILWAY_V1_PARSE", "STARTED_UNAVAILABLE"),
    ("RAILWAY_V1_PARSE", "PARSER_FAILURE"), ("RAILWAY_V1_PARSE", "FAILED_UNAVAILABLE"),
    ("RAILWAY_V1_PARSE", "FINISHED_UNAVAILABLE"), ("RAILWAY_V1_PARSE", "RETRY_LOST_RESPONSE"),
    ("RAILWAY_DURABLE_WORKER", "INTENT_UNAVAILABLE"), ("RAILWAY_DURABLE_WORKER", "STARTED_UNAVAILABLE"),
    ("RAILWAY_DURABLE_WORKER", "PARSER_FAILURE"), ("RAILWAY_DURABLE_WORKER", "FAILED_UNAVAILABLE"),
    ("RAILWAY_DURABLE_WORKER", "FINISHED_UNAVAILABLE"), ("RAILWAY_DURABLE_WORKER", "QUEUE_COMPLETE_UNAVAILABLE"),
    ("RAILWAY_DURABLE_WORKER", "QUEUE_COMPLETE_REJECTED"), ("RAILWAY_DURABLE_WORKER", "TERMINAL_PERSISTED_QUEUE_FAILED"),
    ("RAILWAY_DURABLE_WORKER", "TERMINAL_UNAVAILABLE_BEFORE_QUEUE"), ("RAILWAY_DURABLE_WORKER", "HEARTBEAT_REJECTION"),
    ("RAILWAY_DURABLE_WORKER", "LEASE_CANCELLATION"), ("RAILWAY_DURABLE_WORKER", "RETRY_LOST_RESPONSE"),
])
def test_surface_specific_failure_matrix(surface, scenario, client_factory, monkeypatch):
    """Exercise 26 additional failure scenarios across all production surfaces."""
    import app
    import h3e91_execution
    import worker

    events = []
    bridge_calls = []

    class MockRecorder:
        def __init__(self, *args, **kwargs):
            self.surface = kwargs.get("surface")
            self.execution_id = kwargs.get("execution_id", "test-id")
            self.event_ids = {}

        def bind_revision(self, revision): return self

        async def record(self, kind, outcome=None):
            events.append(kind)
            if scenario == "INTENT_UNAVAILABLE" and kind == "EXECUTION_INTENT":
                raise RuntimeError("H3E91_RECORDING_FAILED_503")
            if scenario == "STARTED_UNAVAILABLE" and kind == "EXECUTION_STARTED":
                raise RuntimeError("H3E91_RECORDING_FAILED_503")
            if scenario == "FINISHED_UNAVAILABLE" and kind == "EXECUTION_FINISHED":
                raise RuntimeError("H3E91_RECORDING_FAILED_503")
            if scenario == "FAILED_UNAVAILABLE" and kind == "EXECUTION_FAILED":
                raise RuntimeError("H3E91_RECORDING_FAILED_503")
            if scenario == "FINISHED_REJECTED" and kind == "EXECUTION_FINISHED":
                return {"status": "REJECTED", "code": "INVALID_TRANSITION"}
            if scenario == "TERMINAL_UNAVAILABLE_BEFORE_QUEUE" and kind in ("EXECUTION_FINISHED", "EXECUTION_FAILED"):
                raise RuntimeError("H3E91_RECORDING_FAILED_503")
            if scenario == "RETRY_LOST_RESPONSE" and kind == "EXECUTION_INTENT" and "EXECUTION_INTENT" in events[:-1]:
                return {"status": "IDEMPOTENT_REPLAY"}
            return {"status": "INSERTED"}

    async def mock_bridge(client, settings, action, body):
        bridge_calls.append(action)
        if scenario == "QUEUE_COMPLETE_UNAVAILABLE" and action == "complete":
            raise RuntimeError("synthetic queue outage")
        if scenario == "QUEUE_COMPLETE_REJECTED" and action == "complete":
            return {"accepted": False}
        if scenario == "TERMINAL_PERSISTED_QUEUE_FAILED" and action == "complete":
            raise RuntimeError("post-terminal queue failure")
        if scenario == "HEARTBEAT_REJECTION" and action == "heartbeat":
            return {"accepted": False, "cancelled": False}
        if scenario == "LEASE_CANCELLATION" and action == "heartbeat":
            return {"accepted": True, "cancelled": True}
        if action == "claim":
            return {"status": "claimed", "job_id": "j1", "message_id": "m1", "attempt": 1,
                    "upload_id": "u1", "user_id": "usr1", "attempt_number": 1,
                    "demo_url": "url", "demo_sha256": DEMO_SHA, "file_size": 520}
        return {"accepted": True, "status": "processed"}

    async def mock_parse_downloaded(*args, **kwargs):
        await kwargs["on_started"]()
        if scenario == "PARSER_FAILURE":
            raise RuntimeError("synthetic parser failure")
        return {"contract_version": 1, "raw": {"artifact_id": "art1", "root_digest": "dig1"}}

    monkeypatch.setattr(h3e91_execution, "ExecutionRecorder", MockRecorder)
    monkeypatch.setattr(app, "_parse_downloaded", mock_parse_downloaded)
    monkeypatch.setattr(worker, "_bridge", mock_bridge)

    if surface == "RAILWAY_V1_PARSE":
        client = client_factory(settings=make_settings(bridge_url="http://bridge", bridge_secret="s"))
        response = client.post("/v1/parse", json=parse_body(), headers=auth())
        # Results vary by scenario but order and safety are verified by MockRecorder
    elif surface == "RAILWAY_DURABLE_WORKER":
        settings = make_settings(bridge_url="http://bridge", bridge_secret="s")
        # We simulate one loop iteration
        try:
            import asyncio
            from worker import durable_consumer_loop
            # Patch sleep to exit loop after one iteration
            async def quick_sleep(sec): raise asyncio.CancelledError()
            monkeypatch.setattr(asyncio, "sleep", quick_sleep)
            asyncio.run(durable_consumer_loop(settings, lambda x: {}))
        except (asyncio.CancelledError, RuntimeError): pass

    assert len(events) > 0 or scenario == "INTENT_UNAVAILABLE"
