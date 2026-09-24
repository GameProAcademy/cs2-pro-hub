"""Dedicated Railway entrypoint for the durable demo queue consumer.

This process is intentionally separate from the FastAPI parser HTTP surface.
The queue consumer must be an always-on background worker so a web-server
restart/healthcheck lifecycle cannot silently leave demo jobs stuck in parsing.
A tiny /health and /version responder is retained because the existing Railway
service uses an HTTP healthcheck and the APP uses /version as the authoritative
worker identity preflight before a real E2E run.
"""

from __future__ import annotations

import asyncio
import logging
import os
import json

from parser_isolated import parse_demo_file_isolated
from runtime_evidence import collect_runtime_evidence
from settings import PARSER_NAME, PARSER_VERSION, load_settings
from worker import durable_consumer_loop

logger = logging.getLogger("cs2-demo-parser-worker")


async def _health_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        request = await reader.read(2048)
        first_line = request.split(b"\r\n", 1)[0] if request else b""
        settings = load_settings()
        request_text = request.decode("latin-1", errors="ignore")
        headers = {}
        for header_line in request_text.split("\r\n")[1:]:
            key, separator, value = header_line.partition(":")
            if separator:
                headers[key.strip().lower()] = value.strip()
        if first_line.startswith(b"GET /health "):
            body = b'{"status":"ok","role":"durable-worker"}'
            response = (
                b"HTTP/1.1 200 OK\r\n"
                b"content-type: application/json\r\n"
                b"content-length: " + str(len(body)).encode() + b"\r\n"
                b"connection: close\r\n\r\n" + body
            )
        elif first_line.startswith(b"GET /v1/runtime/preflight "):
            expected = f"Bearer {settings.token}"
            if headers.get("authorization") != expected:
                body = b'{"error":"unauthorized"}'
                response = (
                    b"HTTP/1.1 401 Unauthorized\r\n"
                    b"content-type: application/json\r\n"
                    b"content-length: " + str(len(body)).encode() + b"\r\n"
                    b"connection: close\r\n\r\n" + body
                )
            else:
                body = json.dumps(collect_runtime_evidence(settings), separators=(",", ":")).encode("utf-8")
                response = (
                    b"HTTP/1.1 200 OK\r\n"
                    b"content-type: application/json\r\n"
                    b"content-length: " + str(len(body)).encode() + b"\r\n"
                    b"connection: close\r\n\r\n" + body
                )
        elif first_line.startswith(b"GET /version "):
            import json

            body = json.dumps(
                {
                    "parser": {
                        "name": PARSER_NAME,
                        "version": PARSER_VERSION,
                        "revision": settings.revision,
                        "semantic_revision": settings.revision,
                        "build_revision": settings.build_revision,
                    },
                    "contract_version": settings.contract_version,
                },
                separators=(",", ":"),
            ).encode("utf-8")
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
        "worker_start semantic_revision=%s build_revision=%s contract=%s worker_id=%s poll=%ss heartbeat=%ss",
        settings.revision,
        settings.build_revision,
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
            # Production queue jobs MUST use the killable parser boundary.
            # demoparser2 is native code and can terminate the process directly;
            # parser_isolated converts child crashes/timeouts into WorkerError.
            await durable_consumer_loop(settings, parse_demo_file_isolated)
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
    # httpx emits request URLs at INFO. The parser downloads short-lived signed
    # Storage URLs, so request logging must not expose those URLs/tokens in
    # Railway logs. Worker diagnostics remain available through our own bounded
    # log messages in parser_isolated.py and worker.py.
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    asyncio.run(main())
