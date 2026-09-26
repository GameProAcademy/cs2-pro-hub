"""CS2 demo parser worker — FastAPI service (GATE 1E.1 contract).

Endpoints
    GET  /health   -> liveness, no external dependency
    GET  /version  -> immutable parser identity + contract version
    POST /v1/parse -> download, verify integrity, parse, return the contract

Contract, error taxonomy and HTTP/retry matrix are documented in
`docs/PHASE-2.7-REAL-DEMO-INGESTION-AND-CANONICAL-ANALYTICS.md` (APP repo) and in
`README.md` next to this file. `errors.py` owns the only allowed error codes.

Security invariants:
* bearer token required, never echoed, never logged;
* HTTPS-only downloads, redirects disabled;
* streaming download with an incremental SHA-256 and a hard byte ceiling;
* temporary file always cleaned up;
* external responses never carry a stack trace, path, signed URL, token, or a
  full SHA-256.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import tempfile
import re
import resource
import time
import uuid
from typing import Any, Awaitable, Callable

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError, Field

import errors as E
from errors import (
    CorruptedDemoError,
    InvalidDemoError,
    UnsupportedDemoError,
    WorkerError,
)
from parser import parse_demo_file
from hot_payload import build_hot_payload, hot_payload_measurements
from raw_artifact import ArtifactContext, RawArtifactWriter
from raw_evidence import finalize_evidence, prepare_evidence
from runtime_evidence import collect_runtime_evidence, parse_memory_snapshot
from settings import (
    DURABLE_HOT_HARD_MAX_BYTES,
    PARSER_NAME,
    PARSER_VERSION,
    SUPPORTED_CONTRACT_VERSIONS,
    Settings,
    load_settings,
)

logger = logging.getLogger("cs2-demo-parser")

#: Injected by tests. Production always uses the real demoparser2 boundary.
ParseFn = Callable[[str], dict[str, Any]]

CS2_DEMO_MAGIC = b"PBDEMS2\x00"
SHA256_HEX = re.compile(r"^[0-9a-fA-F]{64}$")


class ParseRequest(BaseModel):
    contract_version: int
    upload_id: str
    demo_url: str
    demo_sha256: str
    file_size: int
    # HTTP retries are the same logical execution only for the same authenticated
    # job, attempt and upload. The client cannot choose an execution UUID.
    job_id: uuid.UUID | None = None
    attempt_number: int | None = Field(default=None, ge=1)


async def _parse_request(body: ParseRequest, settings: Settings, parse: ParseFn) -> dict[str, Any]:
    payload = await _parse_downloaded(body, settings, parse, finalize_raw=True)
    payload.pop("_performance", None)
    return payload


async def _parse_downloaded(body: ParseRequest, settings: Settings, parse: ParseFn, *,
                            finalize_raw: bool, on_started: Callable[[], Awaitable[None]] | None = None) -> dict[str, Any]:
    request_started = time.perf_counter()
    _check_contract(body.contract_version, settings)
    if body.file_size <= 0:
        raise WorkerError(409, E.CONTRACT_MISMATCH, "file_size must be positive.")
    if body.file_size > settings.max_demo_bytes:
        raise WorkerError(413, E.DEMO_TOO_LARGE, "Demo exceeds the size limit.")
    if not SHA256_HEX.fullmatch(body.demo_sha256):
        raise WorkerError(409, E.CONTRACT_MISMATCH, "demo_sha256 must be a sha256 hex digest.")

    baseline_memory = parse_memory_snapshot()
    download_started = time.perf_counter()
    path, sha256, size = await _download(body.demo_url, body.file_size, settings)
    download_ms = round((time.perf_counter() - download_started) * 1000)
    try:
        if size != body.file_size:
            raise WorkerError(422, E.FILE_SIZE_MISMATCH, "Demo size check failed.")
        if sha256.lower() != body.demo_sha256.lower():
            raise WorkerError(422, E.HASH_MISMATCH, "Demo integrity check failed.")
        _require_cs2_magic(path)
        try:
            if on_started is not None:
                try:
                    await on_started()
                except Exception:
                    raise WorkerError(503, E.PARSER_ERROR, "Execution recording failed before parsing.") from None
            parse_started = time.perf_counter()
            parsed = await asyncio.wait_for(
                asyncio.to_thread(parse, path), timeout=settings.parse_timeout_seconds
            )
            parse_ms = round((time.perf_counter() - parse_started) * 1000)
            parser_memory = parse_memory_snapshot()
        except asyncio.TimeoutError:
            raise WorkerError(504, E.PARSE_TIMEOUT, "Parsing timed out.") from None
        except InvalidDemoError:
            raise WorkerError(422, E.INVALID_DEMO_FORMAT, "File is not a valid CS2 demo.") from None
        except CorruptedDemoError:
            raise WorkerError(422, E.CORRUPTED_DEMO, "Demo file is corrupted.") from None
        except UnsupportedDemoError:
            raise WorkerError(422, E.UNSUPPORTED_DEMO, "Demo variant is not supported.") from None
        except WorkerError:
            raise
        except BaseException as exc:
            logger.exception("parser internal failure: %s", type(exc).__name__)
            raise WorkerError(500, E.PARSER_ERROR, "Parser failed unexpectedly.") from None
    finally:
        _cleanup(path)

    identity = {
        "name": PARSER_NAME,
        "version": PARSER_VERSION,
        "revision": settings.revision,
        "semantic_revision": settings.revision,
        "build_revision": settings.build_revision,
    }
    payload = {
        "parser": identity,
        "contract_version": settings.contract_version,
        "header": parsed.get("header") or {},
        "players": parsed.get("players") or [],
        "rounds": parsed.get("rounds") or [],
        "events": parsed.get("events") or [],
        "warnings": parsed.get("warnings") or [],
        "_performance": {
            "download_ms": download_ms,
            "parser_ms": parse_ms,
            "download_bytes": size,
            "baseline_rss_bytes": baseline_memory["rss_bytes"],
            "baseline_hwm_bytes": baseline_memory["hwm_bytes"],
            "parser_rss_bytes": parser_memory["rss_bytes"],
            "parser_hwm_bytes": parser_memory["hwm_bytes"],
            "parser_ru_maxrss_bytes": parser_memory["ru_maxrss_bytes"],
            "peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "elapsed_ms": round((time.perf_counter() - request_started) * 1000),
        },
    }
    raw_evidence = parsed.get("raw_evidence")
    if isinstance(raw_evidence, dict):
        payload["raw_evidence"] = (
            finalize_evidence(raw_evidence, parser=identity, contract_version=settings.contract_version,
                              demo_sha256=body.demo_sha256, file_size=body.file_size)
            if finalize_raw else
            prepare_evidence(raw_evidence, parser=identity, contract_version=settings.contract_version,
                             demo_sha256=body.demo_sha256, file_size=body.file_size)
        )
    return payload


async def _parse_durable_request(body: ParseRequest, settings: Settings, parse: ParseFn, *,
                                 job_id: str, user_id: str, attempt_number: int,
                                 bridge, client: httpx.AsyncClient, on_started=None) -> dict[str, Any]:
    payload = await _parse_downloaded(body, settings, parse, finalize_raw=False, on_started=on_started)
    performance = payload.pop("_performance", {})
    evidence = payload.pop("raw_evidence", None)
    if not isinstance(evidence, dict):
        raise WorkerError(500, E.PARSER_ERROR, "RAW evidence was not produced.")
    identity = payload["parser"]
    # `_parse_request` finalizes legacy HTTP responses. The durable path uses the
    # already validated metadata but never sends or canonicalizes the full RAW.
    hot_started = time.perf_counter()
    hot = build_hot_payload(payload, parser=identity, contract_version=settings.contract_version,
                            demo_sha256=body.demo_sha256, upload_id=body.upload_id,
                            evidence=evidence)
    writer = RawArtifactWriter(
        context=ArtifactContext(job_id=job_id, upload_id=body.upload_id, user_id=user_id,
                                attempt_number=attempt_number, demo_sha256=body.demo_sha256,
                                parser=identity, contract_version=settings.contract_version),
        bridge=bridge, client=client,
    )
    performance["hot_build_ms"] = round((time.perf_counter() - hot_started) * 1000)
    raw = await writer.write(evidence, performance=performance)
    encoded = JSONResponse(content={"hot": hot, "raw": raw}).body
    hot_metrics = hot_payload_measurements(hot)
    if len(encoded) > min(settings.max_payload_bytes, DURABLE_HOT_HARD_MAX_BYTES):
        largest = max(hot_metrics["sections"].items(), key=lambda item: item[1]["bytes"])[0]
        logger.error("hot_payload_rejected bytes=%s largest_section=%s", len(encoded), largest)
        raise WorkerError(413, E.PAYLOAD_TOO_LARGE, f"HOT payload is too large; largest section: {largest}.")
    logger.info("hot_payload_ready job=%s attempt=%s bytes=%s hot_bytes=%s rows=%s section_bytes=%s limited=%s artifact=%s digest=%s download_ms=%s parser_ms=%s hot_ms=%s peak_rss_kib=%s",
                job_id, attempt_number,
                len(encoded), hot_metrics["hot_payload_bytes"],
                {key: value["rows"] for key, value in hot_metrics["sections"].items()},
                {key: value["bytes"] for key, value in hot_metrics["sections"].items()},
                hot["quality"]["limited_sections"], raw["artifact_id"], str(raw["root_digest"])[:12],
                performance.get("download_ms"), performance.get("parser_ms"),
                performance.get("hot_build_ms"), resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    return {"hot": hot, "raw": raw}


def _envelope(status_code: int, error_code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": {"error_code": error_code, "message": message}},
    )


def _require_token(request: Request, settings: Settings) -> None:
    header = request.headers.get("authorization") or ""
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        raise WorkerError(401, E.UNAUTHORIZED, "Missing bearer credentials.")
    if not hmac.compare_digest(value.strip(), settings.token):
        raise WorkerError(401, E.UNAUTHORIZED, "Invalid credentials.")


def _check_contract(received: int, settings: Settings) -> None:
    if received == settings.contract_version:
        return
    if received in SUPPORTED_CONTRACT_VERSIONS:
        raise WorkerError(
            409,
            E.CONTRACT_MISMATCH,
            f"Worker speaks contract {settings.contract_version}.",
        )
    raise WorkerError(
        409,
        E.UNSUPPORTED_CONTRACT_VERSION,
        f"Contract version {received} is not supported.",
    )


async def _download(url: str, expected_size: int, settings: Settings) -> tuple[str, str, int]:
    """Stream the demo to a temp file. Returns (path, sha256_hex, bytes)."""
    if not url.lower().startswith("https://"):
        # A non-HTTPS URL is the APP violating the request contract.
        raise WorkerError(409, E.CONTRACT_MISMATCH, "demo_url must be an https URL.")

    digest = hashlib.sha256()
    total = 0
    handle = tempfile.NamedTemporaryFile(prefix="demo-", suffix=".dem", delete=False)
    path = handle.name
    try:
        timeout = httpx.Timeout(settings.download_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            async with client.stream("GET", url) as response:
                if response.status_code >= 500:
                    raise WorkerError(503, E.DOWNLOAD_FAILED, "Demo storage is unavailable.")
                if response.status_code >= 300:
                    raise WorkerError(502, E.DOWNLOAD_ERROR, "Demo could not be downloaded.")
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > settings.max_demo_bytes:
                        raise WorkerError(413, E.DEMO_TOO_LARGE, "Demo exceeds the size limit.")
                    if total > expected_size:
                        raise WorkerError(
                            422, E.FILE_SIZE_MISMATCH, "Demo size check failed."
                        )
                    digest.update(chunk)
                    handle.write(chunk)
    except WorkerError:
        handle.close()
        _cleanup(path)
        raise
    except httpx.TimeoutException:
        handle.close()
        _cleanup(path)
        raise WorkerError(504, E.DOWNLOAD_TIMEOUT, "Demo download timed out.") from None
    except httpx.HTTPError:
        handle.close()
        _cleanup(path)
        raise WorkerError(502, E.DOWNLOAD_ERROR, "Demo could not be downloaded.") from None
    except OSError:
        handle.close()
        _cleanup(path)
        raise WorkerError(502, E.DOWNLOAD_ERROR, "Demo could not be read.") from None
    handle.close()
    return path, digest.hexdigest(), total


def _cleanup(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        logger.warning("temporary demo cleanup failed")


def _require_cs2_magic(path: str) -> None:
    """Reject non-CS2 input before invoking the native parser."""
    try:
        with open(path, "rb") as demo:
            magic = demo.read(len(CS2_DEMO_MAGIC))
    except OSError:
        raise WorkerError(502, E.DOWNLOAD_ERROR, "Demo could not be read.") from None
    if magic != CS2_DEMO_MAGIC:
        raise WorkerError(422, E.INVALID_DEMO_FORMAT, "File is not a valid CS2 demo.")


def create_app(
    settings: Settings | None = None,
    parse_fn: ParseFn | None = None,
) -> FastAPI:
    """Build the app. Raises `WorkerConfigurationError` when config fails closed."""
    resolved = settings or load_settings()
    parse = parse_fn or parse_demo_file
    app = FastAPI(title="cs2-demo-parser", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = resolved
    app.state.parse_fn = parse
    app.state.consumer_task = None

    identity = {
        "parser": {
            "name": PARSER_NAME,
            "version": PARSER_VERSION,
            # Backward-compatible semantic lock plus an optional exact build id.
            "revision": resolved.revision,
            "semantic_revision": resolved.revision,
            "build_revision": resolved.build_revision,
        },
        "contract_version": resolved.contract_version,
    }

    @app.exception_handler(WorkerError)
    async def _worker_error(_: Request, exc: WorkerError) -> JSONResponse:
        return _envelope(exc.status_code, exc.error_code, exc.message)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unexpected worker failure: %s", type(exc).__name__)
        return _envelope(500, E.PARSER_ERROR, "Parser failed unexpectedly.")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/version")
    async def version() -> dict[str, Any]:
        return identity

    @app.get("/v1/runtime/preflight")
    async def runtime_preflight(request: Request) -> dict[str, Any]:
        _require_token(request, resolved)
        return collect_runtime_evidence(resolved)

    @app.post("/v1/parse")
    async def parse_endpoint(request: Request) -> JSONResponse:
        _require_token(request, resolved)
        try:
            body = ParseRequest.model_validate(await request.json())
        except (ValidationError, ValueError):
            raise WorkerError(409, E.CONTRACT_MISMATCH, "Malformed parse request.") from None
        if body.job_id is None or body.attempt_number is None:
            raise WorkerError(409, E.CONTRACT_MISMATCH, "Logical execution identity is required.")
        try:
            upload_uuid = uuid.UUID(body.upload_id)
        except ValueError:
            raise WorkerError(409, E.CONTRACT_MISMATCH, "Invalid upload identity.") from None
        logical_identity = f"h3e91:v1:{body.job_id}:{body.attempt_number}:{upload_uuid}"

        from h3e91_execution import ExecutionRecorder
        async with httpx.AsyncClient(timeout=30) as execution_client:
            try:
                recorder = ExecutionRecorder(execution_client, resolved, upload_id=body.upload_id,
                                             surface="RAILWAY_V1_PARSE", demo_sha256=body.demo_sha256,
                                              file_size=body.file_size, job_id=str(body.job_id),
                                              attempt_number=body.attempt_number,
                                              execution_id=str(uuid.uuid5(uuid.NAMESPACE_URL, logical_identity)),
                                              correlation_id=str(uuid.uuid5(uuid.NAMESPACE_URL, logical_identity + ":correlation"))).bind_revision(resolved.revision)
                intent_result = await recorder.record("EXECUTION_INTENT")
                # A replayed INTENT may already have STARTED or a terminal row.
                # Without an authenticated read of that lifecycle, never parse twice.
                if intent_result.get("status") != "INSERTED":
                    raise WorkerError(409, E.SAFE_REPLAY_REQUIRES_RECONCILIATION, "Execution already recorded; reconciliation required.")
            except WorkerError:
                raise
            except Exception:
                raise WorkerError(503, E.PARSER_ERROR, "Execution recording unavailable.") from None
            started = False
            async def record_start() -> None:
                nonlocal started
                await recorder.record("EXECUTION_STARTED")
                started = True
            try:
                payload = await _parse_downloaded(body, resolved, parse, finalize_raw=True,
                                                  on_started=record_start)
                payload.pop("_performance", None)
                response = JSONResponse(content=payload)
                if len(response.body) > resolved.max_payload_bytes:
                    raise WorkerError(413, E.PAYLOAD_TOO_LARGE, "Parser response is too large.")
            except BaseException:
                await recorder.record("EXECUTION_FAILED" if started else "EXECUTION_ABORTED",
                                      "PARSE_FAILED" if started else "PREPARSE_FAILED")
                raise
            try:
                await recorder.record("EXECUTION_FINISHED", "PARSE_SUCCEEDED")
            except Exception:
                logger.error("terminal execution evidence unavailable job=%s attempt=%s", body.job_id, body.attempt_number)
                raise WorkerError(503, E.PARSER_ERROR, "Execution recording unavailable; reconciliation required.") from None
        return response

    if resolved.bridge_url and resolved.bridge_secret:
        from worker import durable_consumer_loop

        @app.on_event("startup")
        async def _start_consumer() -> None:
            app.state.consumer_task = asyncio.create_task(
                durable_consumer_loop(resolved, parse), name="demo-queue-consumer"
            )

        @app.on_event("shutdown")
        async def _stop_consumer() -> None:
            task = app.state.consumer_task
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    return app


# Fails closed at import time when the deployment is not provably configured
# (missing token, or a missing/invalid PARSER_REVISION in production).
app = create_app() if os.getenv("PARSER_SKIP_BOOTSTRAP") != "1" else None
