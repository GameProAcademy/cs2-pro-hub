"""Dedicated Railway entrypoint for the durable demo queue consumer.

This process is intentionally separate from the FastAPI parser HTTP surface.
The queue consumer must be an always-on background worker so a web-server
restart/healthcheck lifecycle cannot silently leave demo jobs stuck in parsing.
"""

from __future__ import annotations

import asyncio
import logging

from parser import parse_demo_file
from settings import load_settings
from worker import durable_consumer_loop

logger = logging.getLogger("cs2-demo-parser-worker")


async def main() -> None:
    settings = load_settings()
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


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(main())
