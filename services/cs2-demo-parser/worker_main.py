"""Dedicated Railway entrypoint for the durable demo queue consumer.

This process is intentionally separate from the FastAPI parser HTTP surface.
The queue consumer must be an always-on background worker so a web-server
restart/healthcheck lifecycle cannot silently leave demo jobs stuck in parsing.
A tiny /health responder is retained because the existing Railway service uses
an HTTP healthcheck before activating a deployment.
"""

from __future__ import annotations

import asyncio
import logging
import os

from parser import parse_demo_file
from settings import load_settings
from worker import durable_consumer_loop

logger = logging.getLogger("cs2-demo-parser-worker")


async def _health_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        request = await reader.read(2048)
        first_line = request.split(b"\r\n", 1)[0] if request else b""
        if first_line.startswith(b"GET /health "):
            body = b'{"status":"ok","role":"durable-worker"}'
            response = (
                b"HTTP/1.1 200 OK\r\n"
                b"content-type: application/json\r\n"
                b"content-length: " + str(len(body)).encode() + b"\r\n"
                b"connection: close\r\n\r\n" + body
            )
        else:
            body = b'{"error":"not_found"}'
            response = (
                b"HTTP/1.1 404 Not Found\r\n"
                b"content-type: application/json\r\n"
                b"content-length: " + str(len(body)).encode() + b"\r\n"
                b"connection: close\r\n\r\n" + body
            )
        writer.write(response)
        await writer.drain()
    finally:
        writer.close()
        await writer.wait_closed()


async def _consumer_supervisor(settings) -> None:
    logger.info(
        "worker_start revision=%s contract=%s worker_id=%s poll=%ss heartbeat=%ss",
        settings.revision,
        settings.contract_version,
        settings.worker_id,
        settings.queue_poll_seconds,
        settings.queue_heartbeat_seconds,
    )

    # The consumer loop already contains per-poll/per-job recovery. This outer
    # supervisor is the final safety net: an unexpected exception must never
    # silently kill the consumer while leaving the Railway process healthy.
    while True:
        try:
            await durable_consumer_loop(settings, parse_demo_file)
        except asyncio.CancelledError:
            raise
        except BaseException:
            logger.exception("worker_consumer_crashed; restarting_consumer_loop")
            await asyncio.sleep(2)


async def main() -> None:
    settings = load_settings()
    port = int(os.getenv("PORT", "8080"))
    health_server = await asyncio.start_server(_health_client, host="0.0.0.0", port=port)
    logger.info("worker_health_listening port=%s", port)
    try:
        async with health_server:
            await asyncio.gather(
                health_server.serve_forever(),
                _consumer_supervisor(settings),
            )
    finally:
        health_server.close()
        await health_server.wait_closed()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(main())
