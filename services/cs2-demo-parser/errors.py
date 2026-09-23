"""GATE 1E.1 — official worker error taxonomy.

This module is the SINGLE source of truth for the wire protocol codes emitted by
this worker. The APP mirrors this list in
`src/lib/pipeline/parser/parserEndpoint.ts` (`WORKER_ERROR_CODES`); there is no
second, parallel taxonomy.

Every HTTP error response uses exactly one envelope:

    {"detail": {"error_code": "<CODE>", "message": "<safe message>"}}

The message is always safe for external consumption: no stack traces, no
filesystem paths, no signed URLs, no bearer token, no full SHA-256, no container
internals. Technical detail belongs in the internal logs only.
"""

from __future__ import annotations

# --- authentication -------------------------------------------------------
UNAUTHORIZED = "UNAUTHORIZED"
FORBIDDEN = "FORBIDDEN"

# --- request contract -----------------------------------------------------
CONTRACT_MISMATCH = "CONTRACT_MISMATCH"
UNSUPPORTED_CONTRACT_VERSION = "UNSUPPORTED_CONTRACT_VERSION"

# --- demo semantics -------------------------------------------------------
INVALID_DEMO_FORMAT = "INVALID_DEMO_FORMAT"
CORRUPTED_DEMO = "CORRUPTED_DEMO"
UNSUPPORTED_DEMO = "UNSUPPORTED_DEMO"

# --- integrity ------------------------------------------------------------
HASH_MISMATCH = "HASH_MISMATCH"
FILE_SIZE_MISMATCH = "FILE_SIZE_MISMATCH"

# --- size ceilings --------------------------------------------------------
DEMO_TOO_LARGE = "DEMO_TOO_LARGE"
PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"

# --- transport ------------------------------------------------------------
DOWNLOAD_ERROR = "DOWNLOAD_ERROR"
DOWNLOAD_FAILED = "DOWNLOAD_FAILED"
TIMEOUT = "TIMEOUT"
PARSE_TIMEOUT = "PARSE_TIMEOUT"
DOWNLOAD_TIMEOUT = "DOWNLOAD_TIMEOUT"

# --- unexpected internal failure -----------------------------------------
PARSER_ERROR = "PARSER_ERROR"

# --- offline reference harness -------------------------------------------
# These are not HTTP wire codes. They centralize the fail-closed vocabulary
# used by the authorized local parity harness without widening the API.
NO_AUTHORIZED_REAL_DEM_FIXTURE = "NO_AUTHORIZED_REAL_DEM_FIXTURE"
NO_AUTHORIZED_REAL_DEM = "NO_AUTHORIZED_REAL_DEM"
EXPLICIT_AUTHORIZED_DEM_PATH_REQUIRED = "explicit_authorized_dem_path_required"
AUTHORIZED_DEM_SIZE_OUT_OF_BOUNDS = "authorized_demo_size_out_of_bounds"
AUTHORIZED_DEM_METADATA_MISMATCH = "authorized_dem_metadata_mismatch"

WORKER_ERROR_CODES: tuple[str, ...] = (
    UNAUTHORIZED,
    FORBIDDEN,
    CONTRACT_MISMATCH,
    UNSUPPORTED_CONTRACT_VERSION,
    INVALID_DEMO_FORMAT,
    CORRUPTED_DEMO,
    UNSUPPORTED_DEMO,
    HASH_MISMATCH,
    FILE_SIZE_MISMATCH,
    DEMO_TOO_LARGE,
    PAYLOAD_TOO_LARGE,
    DOWNLOAD_ERROR,
    DOWNLOAD_FAILED,
    TIMEOUT,
    PARSE_TIMEOUT,
    DOWNLOAD_TIMEOUT,
    PARSER_ERROR,
)


class WorkerConfigurationError(RuntimeError):
    """Raised at startup when the worker cannot run in a provable state.

    Fail closed: the process must not serve traffic with an unknown identity.
    """


class WorkerError(Exception):
    """An error with a wire code + HTTP status + externally safe message."""

    def __init__(self, status_code: int, error_code: str, message: str) -> None:
        if error_code not in WORKER_ERROR_CODES:
            # Never invent a code outside the official matrix.
            raise WorkerConfigurationError(f"unknown worker error code: {error_code}")
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = message

    def envelope(self) -> dict[str, dict[str, str]]:
        return {"detail": {"error_code": self.error_code, "message": self.message}}


class InvalidDemoError(Exception):
    """Positive evidence that the file is not a demo this parser can read."""


class CorruptedDemoError(Exception):
    """Positive evidence that the demo bytes are truncated/corrupted."""


class UnsupportedDemoError(Exception):
    """A known-but-unsupported demo variant (for example a GOTV/CS:GO demo)."""
