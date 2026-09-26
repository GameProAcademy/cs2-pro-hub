"""Fail-closed H3E91 execution-event transport. It never handles demo bytes or URLs."""

from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import urlsplit

import httpx

from settings import PARSER_NAME, PARSER_VERSION, Settings


class ExecutionRecorder:
    def __init__(self, client: httpx.AsyncClient, settings: Settings, *, upload_id: str,
                 surface: str, job_id: str | None = None, attempt_number: int | None = None,
                 demo_sha256: str | None = None, file_size: int | None = None,
                 execution_id: str | None = None, correlation_id: str | None = None) -> None:
        if not settings.bridge_url or not settings.bridge_secret:
            raise RuntimeError("H3E91_EXECUTION_BRIDGE_NOT_CONFIGURED")
        split = urlsplit(settings.bridge_url)
        self.url = f"{split.scheme}://{split.netloc}/api/public/h3e91-execution-event"
        self.client = client
        self.secret = settings.bridge_secret
        self.execution_id = execution_id or str(uuid.uuid4())
        self.correlation_id = correlation_id or str(uuid.uuid4())
        self.base = {
            "protocol": "H3E91_EXECUTION_BRIDGE_V1", "executionId": self.execution_id,
            "uploadId": upload_id, "correlationId": self.correlation_id, "jobId": job_id,
            "attemptNumber": attempt_number, "demoSha256": demo_sha256, "fileSize": file_size,
            "executionSurface": surface, "source": "RAILWAY", "eventVersion": 1,
            "metadataDigest": None,
        }

    async def record(self, event_type: str, outcome_code: str | None = None) -> dict[str, Any]:
        intent = event_type == "EXECUTION_INTENT"
        body = {**self.base, "eventId": str(uuid.uuid4()), "eventType": event_type,
                "parserName": None if intent else PARSER_NAME,
                "parserVersion": None if intent else PARSER_VERSION,
                "parserRevision": None if intent else self._revision,
                "outcomeCode": outcome_code}
        response = await self.client.post(self.url, headers={"authorization": f"Bearer {self.secret}"}, json=body)
        if response.status_code not in (200, 201):
            raise RuntimeError(f"H3E91_RECORDING_FAILED_{response.status_code}")
        result = response.json()
        if not isinstance(result, dict) or result.get("status") not in ("INSERTED", "IDEMPOTENT_REPLAY"):
            raise RuntimeError("H3E91_RECORDING_INVALID_RESPONSE")
        return result

    @property
    def _revision(self) -> str:
        return self.settings_revision

    def bind_revision(self, revision: str) -> "ExecutionRecorder":
        self.settings_revision = revision
        return self