"""Synthetic transport failures; no real demo is downloaded or parsed."""
import asyncio
import json
import uuid

import httpx
import pytest

from conftest import DEMO_SHA, make_settings
from h3e91_execution import ExecutionRecorder


def test_missing_bridge_fails_closed():
    client = httpx.AsyncClient()
    try:
        with pytest.raises(RuntimeError, match="H3E91_EXECUTION_BRIDGE_NOT_CONFIGURED"):
            ExecutionRecorder(client, make_settings(), upload_id="synthetic", surface="RAILWAY_V1_PARSE")
    finally:
        asyncio.run(client.aclose())


@pytest.mark.parametrize("status,payload", [
    (401, {"code": "UNAUTHORIZED"}), (400, {"code": "INVALID_INPUT"}),
    (409, {"status": "REJECTED"}), (413, {}), (503, {}),
    (201, {"status": "REJECTED"}), (200, {}),
])
def test_transport_rejection_fails_closed(status, payload):
    async def transport(request):
        assert request.url.path == "/api/public/h3e91-execution-event"
        assert b"demo_url" not in request.content and b"signedUrl" not in request.content
        return httpx.Response(status, json=payload)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            recorder = ExecutionRecorder(client, make_settings(
                bridge_url="https://synthetic.invalid/api/public/pipeline-worker",
                bridge_secret="synthetic-test-only",
            ), upload_id="11111111-1111-1111-1111-111111111111",
                surface="RAILWAY_V1_PARSE", demo_sha256=DEMO_SHA, file_size=100)
            with pytest.raises(RuntimeError, match="H3E91_RECORDING_"):
                await recorder.record("EXECUTION_INTENT")
    asyncio.run(run())


def test_network_failure_fails_closed():
    async def transport(_request):
        raise httpx.ConnectError("synthetic outage")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            recorder = ExecutionRecorder(client, make_settings(
                bridge_url="https://synthetic.invalid/api/public/pipeline-worker",
                bridge_secret="synthetic-test-only",
            ), upload_id="11111111-1111-1111-1111-111111111111", surface="RAILWAY_V1_PARSE")
            with pytest.raises(httpx.ConnectError):
                await recorder.record("EXECUTION_INTENT")
    asyncio.run(run())


def test_ambiguous_insert_retry_reuses_event_identity():
    received = []

    async def transport(request):
        received.append(request.read().decode())
        if len(received) == 1:
            raise httpx.ReadError("response lost after synthetic insert")
        return httpx.Response(200, json={"status": "IDEMPOTENT_REPLAY"})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            recorder = ExecutionRecorder(client, make_settings(
                bridge_url="https://synthetic.invalid/api/public/pipeline-worker",
                bridge_secret="synthetic-test-only",
            ), upload_id="11111111-1111-1111-1111-111111111111", surface="RAILWAY_V1_PARSE")
            with pytest.raises(httpx.ReadError):
                await recorder.record("EXECUTION_INTENT")
            assert (await recorder.record("EXECUTION_INTENT"))["status"] == "IDEMPOTENT_REPLAY"
            assert received[0] == received[1]
    asyncio.run(run())


def test_execution_identity_changes_when_upload_changes():
    settings = make_settings(
        bridge_url="https://synthetic.invalid/api/public/pipeline-worker",
        bridge_secret="synthetic-test-only",
    )
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _request: httpx.Response(201, json={"status": "INSERTED"}))) as client:
            common = dict(
                client=client,
                settings=settings,
                surface="RAILWAY_DURABLE_WORKER",
                job_id="22222222-2222-2222-2222-222222222222",
                attempt_number=7,
                demo_sha256=DEMO_SHA,
                file_size=520,
            )
            first = ExecutionRecorder(common["client"], common["settings"], upload_id="11111111-1111-1111-1111-111111111111", **{k: v for k, v in common.items() if k not in {"client", "settings"}})
            second = ExecutionRecorder(common["client"], common["settings"], upload_id="33333333-3333-3333-3333-333333333333", **{k: v for k, v in common.items() if k not in {"client", "settings"}})
            assert first.execution_id != second.execution_id
            assert first.correlation_id != second.correlation_id
    asyncio.run(run())


def test_lifecycle_read_is_minimal_and_fails_closed():
    execution_id = "11111111-1111-5111-8111-111111111111"
    allowed = {
        "executionId": execution_id,
        "lifecycle": "STARTED",
        "terminalEventId": None,
        "terminalOutcome": None,
        "terminalEventAt": None,
        "hasStarted": True,
        "hasTerminal": False,
    }

    async def run(payload, status=200):
        async def transport(request):
            assert request.url.path == "/api/public/h3e91-execution-lifecycle"
            assert json.loads(request.content) == {"executionId": execution_id}
            return httpx.Response(status, json=payload)
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            recorder = ExecutionRecorder(
                client,
                make_settings(bridge_url="https://synthetic.invalid/bridge", bridge_secret="synthetic-test-only"),
                upload_id="22222222-2222-2222-2222-222222222222",
                surface="RAILWAY_V1_PARSE",
                execution_id=execution_id,
            )
            return await recorder.read_lifecycle()

    assert asyncio.run(run(allowed)) == allowed
    with pytest.raises(RuntimeError, match="INVALID_RESPONSE"):
        asyncio.run(run({**allowed, "parserOutput": {"unsafe": True}}))
    with pytest.raises(RuntimeError, match="FAILED_503"):
        asyncio.run(run({"code": "unavailable"}, 503))


def test_reconstructed_http_retry_and_terminal_replays_keep_database_identity():
    """Each request creates a fresh recorder; a lost response never creates another execution."""
    rows = {}
    statuses = []
    execution_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "h3e91:v1:job:1:upload"))
    correlation_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "h3e91:v1:job:1:upload:correlation"))

    async def transport(request):
        body = json.loads(request.content)
        event_id = body["eventId"]
        old = rows.get(event_id)
        if old is None:
            rows[event_id] = body
            status = "INSERTED"
        elif old == body:
            status = "IDEMPOTENT_REPLAY"
        else:
            status = "REJECTED"
        statuses.append(status)
        if len(statuses) == 1:
            raise httpx.ReadError("synthetic response lost after insert")
        return httpx.Response(201 if status == "INSERTED" else 200, json={"status": status})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            def new_request():
                return ExecutionRecorder(client, make_settings(
                    bridge_url="https://synthetic.invalid/api/public/pipeline-worker",
                    bridge_secret="synthetic-test-only",
                ), upload_id="11111111-1111-1111-1111-111111111111", surface="RAILWAY_V1_PARSE",
                    job_id="22222222-2222-2222-2222-222222222222", attempt_number=1,
                    demo_sha256=DEMO_SHA, file_size=520,
                    execution_id=execution_id, correlation_id=correlation_id).bind_revision("git:" + "a" * 40)

            with pytest.raises(httpx.ReadError):
                await new_request().record("EXECUTION_INTENT")
            assert (await new_request().record("EXECUTION_INTENT"))["status"] == "IDEMPOTENT_REPLAY"
            for event_type, outcome in (("EXECUTION_STARTED", None), ("EXECUTION_FINISHED", "PARSE_SUCCEEDED")):
                assert (await new_request().record(event_type, outcome))["status"] == "INSERTED"
                assert (await new_request().record(event_type, outcome))["status"] == "IDEMPOTENT_REPLAY"
            assert len(rows) == 3
            assert all(row["executionId"] == execution_id for row in rows.values())
    asyncio.run(run())