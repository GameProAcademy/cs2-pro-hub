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
    assert first.status_code == 200
    # A genuinely new HTTP request constructs a new recorder. A lost response
    # cannot accidentally start a second parse, even though INTENT replays.
    second = client.post("/v1/parse", json=body, headers=auth())
    assert second.status_code == 409
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