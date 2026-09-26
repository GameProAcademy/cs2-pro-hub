"""Synthetic transport failures; no real demo is downloaded or parsed."""
import asyncio

import httpx
import pytest

from conftest import DEMO_SHA, make_settings
from h3e91_execution import ExecutionRecorder


def test_missing_bridge_fails_closed():
    with httpx.AsyncClient() as client:
        with pytest.raises(RuntimeError, match="H3E91_EXECUTION_BRIDGE_NOT_CONFIGURED"):
            ExecutionRecorder(client, make_settings(), upload_id="synthetic", surface="RAILWAY_V1_PARSE")


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