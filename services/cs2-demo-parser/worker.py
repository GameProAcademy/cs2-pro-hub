"""Persistent durable queue consumer. It never accesses the database directly."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

import httpx

from errors import WorkerError
from settings import Settings

logger = logging.getLogger("cs2-demo-parser")


async def _bridge(client: httpx.AsyncClient, settings: Settings, action: str, body: dict[str, Any]) -> dict[str, Any]:
    assert settings.bridge_url and settings.bridge_secret
    response = await client.post(
        f"{settings.bridge_url}/{action}",
        headers={"authorization": f"Bearer {settings.bridge_secret}"},
        json=body,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError("invalid bridge response")
    return payload


def _worker_error_code(error: WorkerError) -> str:
    """Keep the wire taxonomy; the APP owns the sole worker-to-pipeline mapping."""
    return error.error_code


async def _heartbeat_loop(client: httpx.AsyncClient, settings: Settings, identity: dict[str, Any], stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.queue_heartbeat_seconds)
        except asyncio.TimeoutError:
            try:
                response = await _bridge(client, settings, "heartbeat", {**identity, "stage": "parsing"})
            except httpx.HTTPError:
                stop.set()
                return
            if response.get("cancelled") is True or response.get("accepted") is not True:
                stop.set()
                return


async def durable_consumer_loop(settings: Settings, parse: Callable[[str], dict[str, Any]]) -> None:
    from app import ParseRequest, _parse_durable_request

    timeout = httpx.Timeout(settings.download_timeout_seconds + settings.parse_timeout_seconds + 60)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        while True:
            try:
                claim = await _bridge(client, settings, "claim", {"workerId": settings.worker_id})
                if claim.get("status") != "claimed":
                    await asyncio.sleep(settings.queue_poll_seconds)
                    continue
                identity = {
                    "jobId": claim["job_id"],
                    "messageId": claim["message_id"],
                    "attempt": claim["attempt"],
                    "workerId": settings.worker_id,
                }
                stop = asyncio.Event()
                heartbeat = asyncio.create_task(_heartbeat_loop(client, settings, identity, stop))
                try:
                    result = await _parse_durable_request(
                        ParseRequest(
                            contract_version=settings.contract_version,
                            upload_id=claim["upload_id"],
                            demo_url=claim["demo_url"],
                            demo_sha256=claim["demo_sha256"],
                            file_size=claim["file_size"],
                        ),
                        settings,
                        parse,
                        job_id=identity["jobId"],
                        user_id=claim["user_id"],
                        attempt_number=claim["attempt_number"],
                    )
                    if stop.is_set():
                        logger.info("completion suppressed after lease or cancellation rejection")
                        continue
                    final_heartbeat = await _bridge(client, settings, "heartbeat", {**identity, "stage": "persisting"})
                    if final_heartbeat.get("accepted") is True and final_heartbeat.get("cancelled") is not True:
                        complete_body = {**identity, **result}
                        logger.info("job_complete_start bytes=%s artifact=%s digest=%s",
                                    len(__import__("json").dumps(complete_body, separators=(",", ":")).encode()),
                                    result["raw"]["artifact_id"], str(result["raw"]["root_digest"])[:12])
                        await _bridge(client, settings, "complete", complete_body)
                except WorkerError as error:
                    await _bridge(client, settings, "fail", {**identity, "errorCode": _worker_error_code(error), "detail": error.message})
                except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as error:
                    logger.warning("durable job interrupted type=%s", type(error).__name__)
                finally:
                    stop.set()
                    heartbeat.cancel()
                    try:
                        await heartbeat
                    except asyncio.CancelledError:
                        pass
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.warning("queue poll failed type=%s", type(error).__name__)
                await asyncio.sleep(settings.queue_poll_seconds)