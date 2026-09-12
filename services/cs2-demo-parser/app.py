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
import logging
import os
import tempfile
import re
from typing import Any, Callable

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

import errors as E
from errors import (
    CorruptedDemoError,
    InvalidDemoError,
    UnsupportedDemoError,
    WorkerError,
)
from parser import parse_demo_file
from raw_evidence import finalize_evidence
from settings import (
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
    if value.strip() != settings.token:
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

    identity = {
        "parser": {
            "name": PARSER_NAME,
            "version": PARSER_VERSION,
            # Exactly the revision this process runs with — single source.
            "revision": resolved.revision,
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

    @app.post("/v1/parse")
    async def parse_endpoint(request: Request) -> JSONResponse:
        _require_token(request, resolved)
        try:
            body = ParseRequest.model_validate(await request.json())
        except (ValidationError, ValueError):
            raise WorkerError(409, E.CONTRACT_MISMATCH, "Malformed parse request.") from None

        _check_contract(body.contract_version, resolved)
        if body.file_size <= 0:
            raise WorkerError(409, E.CONTRACT_MISMATCH, "file_size must be positive.")
        if body.file_size > resolved.max_demo_bytes:
            raise WorkerError(413, E.DEMO_TOO_LARGE, "Demo exceeds the size limit.")
        if not SHA256_HEX.fullmatch(body.demo_sha256):
            raise WorkerError(409, E.CONTRACT_MISMATCH, "demo_sha256 must be a sha256 hex digest.")

        path, sha256, size = await _download(body.demo_url, body.file_size, resolved)
        try:
            if size != body.file_size:
                raise WorkerError(422, E.FILE_SIZE_MISMATCH, "Demo size check failed.")
            if sha256.lower() != body.demo_sha256.lower():
                raise WorkerError(422, E.HASH_MISMATCH, "Demo integrity check failed.")

            _require_cs2_magic(path)

            try:
                parsed = await asyncio.wait_for(
                    asyncio.to_thread(parse, path),
                    timeout=resolved.parse_timeout_seconds,
                )
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
            except BaseException as exc:  # noqa: BLE001 - internal failure, not a bad demo
                logger.exception("parser internal failure: %s", type(exc).__name__)
                raise WorkerError(500, E.PARSER_ERROR, "Parser failed unexpectedly.") from None
        finally:
            _cleanup(path)

        payload = {
            "parser": dict(identity["parser"]),
            "contract_version": resolved.contract_version,
            "header": parsed.get("header") or {},
            "players": parsed.get("players") or [],
            "rounds": parsed.get("rounds") or [],
            "events": parsed.get("events") or [],
            "warnings": parsed.get("warnings") or [],
        }
        raw_evidence = parsed.get("raw_evidence")
        if isinstance(raw_evidence, dict):
            payload["raw_evidence"] = finalize_evidence(
                raw_evidence,
                parser=dict(identity["parser"]),
                contract_version=resolved.contract_version,
                demo_sha256=body.demo_sha256,
                file_size=body.file_size,
            )
        response = JSONResponse(content=payload)
        if len(response.body) > resolved.max_payload_bytes:
            raise WorkerError(413, E.PAYLOAD_TOO_LARGE, "Parser response is too large.")
        return response

    return app


# Fails closed at import time when the deployment is not provably configured
# (missing token, or a missing/invalid PARSER_REVISION in production).
app = create_app() if os.getenv("PARSER_SKIP_BOOTSTRAP") != "1" else None
