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
                logger.warning(
                    "heartbeat_transport_failed job=%s message=%s attempt=%s",
                    identity.get("jobId"), identity.get("messageId"), identity.get("attempt"),
                )
                stop.set()
                return
            if response.get("cancelled") is True or response.get("accepted") is not True:
                logger.warning(
                    "heartbeat_rejected job=%s message=%s attempt=%s accepted=%s cancelled=%s",
                    identity.get("jobId"), identity.get("messageId"), identity.get("attempt"),
                    response.get("accepted"), response.get("cancelled"),
                )
                stop.set()
                return


async def durable_consumer_loop(settings: Settings, parse: Callable[[str], dict[str, Any]]) -> None:
    from app import ParseRequest, _parse_request

    timeout = httpx.Timeout(settings.download_timeout_seconds + settings.parse_timeout_seconds + 60)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        logger.info("consumer_loop_started worker_id=%s revision=%s", settings.worker_id, settings.revision)
        while True:
            try:
                claim = await _bridge(client, settings, "claim", {"workerId": settings.worker_id})
                logger.info(
                    "claim_result status=%s job=%s message=%s attempt=%s",
                    claim.get("status"), claim.get("job_id"), claim.get("message_id"), claim.get("attempt"),
                )
                if claim.get("status") != "claimed":
                    await asyncio.sleep(settings.queue_poll_seconds)
                    continue

                identity = {
                    "jobId": claim["job_id"],
                    "messageId": claim["message_id"],
                    "attempt": claim["attempt"],
                    "workerId": settings.worker_id,
                }
                logger.info(
                    "job_claimed job=%s message=%s attempt=%s upload=%s size=%s sha=%s",
                    identity["jobId"], identity["messageId"], identity["attempt"],
                    claim.get("upload_id"), claim.get("file_size"),
                    str(claim.get("demo_sha256", ""))[:12],
                )

                stop = asyncio.Event()
                heartbeat = asyncio.create_task(_heartbeat_loop(client, settings, identity, stop))
                try:
                    logger.info("job_parse_start job=%s attempt=%s", identity["jobId"], identity["attempt"])
                    result = await _parse_request(
                        ParseRequest(
                            contract_version=settings.contract_version,
                            upload_id=claim["upload_id"],
                            demo_url=claim["demo_url"],
                            demo_sha256=claim["demo_sha256"],
                            file_size=claim["file_size"],
                        ),
                        settings,
                        parse,
                    )
                    logger.info("job_parse_success job=%s attempt=%s", identity["jobId"], identity["attempt"])
                    if stop.is_set():
                        logger.info("completion_suppressed_after_lease_or_cancellation job=%s", identity["jobId"])
                        continue
                    final_heartbeat = await _bridge(client, settings, "heartbeat", {**identity, "stage": "persisting"})
                    if final_heartbeat.get("accepted") is True and final_heartbeat.get("cancelled") is not True:
                        logger.info("job_complete_start job=%s attempt=%s", identity["jobId"], identity["attempt"])
                        await _bridge(client, settings, "complete", {**identity, "result": result})
                        logger.info("job_complete_sent job=%s attempt=%s", identity["jobId"], identity["attempt"])
                except WorkerError as error:
                    logger.error(
                        "job_worker_error job=%s attempt=%s code=%s detail=%s",
                        identity["jobId"], identity["attempt"], error.error_code, error.message,
                    )
                    await _bridge(client, settings, "fail", {**identity, "errorCode": _worker_error_code(error), "detail": error.message})
                except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as error:
                    logger.exception(
                        "job_interrupted job=%s attempt=%s type=%s",
                        identity["jobId"], identity["attempt"], type(error).__name__,
                    )
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
                logger.exception("queue_poll_failed type=%s", type(error).__name__)
                await asyncio.sleep(settings.queue_poll_seconds)
