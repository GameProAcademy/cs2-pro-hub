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
SAFE_REPLAY_REQUIRES_RECONCILIATION = "SAFE_REPLAY_REQUIRES_RECONCILIATION"
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
AUTHORIZED_DEM_METADATA_MISMATCH = "authorized_demo_metadata_mismatch"

WORKER_ERROR_CODES: tuple[str, ...] = (
    UNAUTHORIZED,
    FORBIDDEN,
    CONTRACT_MISMATCH,
    SAFE_REPLAY_REQUIRES_RECONCILIATION,
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


# --- internal failure classes (NOT wire codes) -----------------------------
# What kind of failure happened, independent of the wire code the APP sees.
# The wire protocol is unchanged: each class maps onto an EXISTING code below,
# and the class itself travels only in server-side logs and on the in-process
# WorkerError object. Promoting a class to the wire (for example emitting a
# dedicated code for RESOURCE_EXHAUSTED) is a coordinated worker + APP change
# and is deliberately not done here. See docs/PARSER_FAILURE_TAXONOMY.md.
NO_DATA = "NO_DATA"  # the demo does not contain the stream; never an error
PARSER_FAILURE = "PARSER_FAILURE"  # the parser failed on this demo/capability
RESOURCE_EXHAUSTED = "RESOURCE_EXHAUSTED"  # memory or time ran out
CANCELLED = "CANCELLED"  # shutdown or cancellation interrupted the work
INVALID_OUTPUT = "INVALID_OUTPUT"  # output outside the declared contract

FAILURE_CLASSES: tuple[str, ...] = (
    NO_DATA,
    PARSER_FAILURE,
    RESOURCE_EXHAUSTED,
    CANCELLED,
    INVALID_OUTPUT,
)

# Existing wire code used for each failure class. NO_DATA has none: it is a
# capability state (NOT_PRESENT_IN_DEMO / AVAILABLE_BUT_EMPTY), not a failure.
FAILURE_CLASS_WIRE_CODE: dict[str, str] = {
    PARSER_FAILURE: PARSER_ERROR,
    RESOURCE_EXHAUSTED: PARSER_ERROR,
    CANCELLED: PARSER_ERROR,
    INVALID_OUTPUT: PARSER_ERROR,
}

# POSIX signals that end a parser child, by what they mean for the job.
_SIGNAL_CLASS: dict[int, str] = {
    9: RESOURCE_EXHAUSTED,  # SIGKILL: what the kernel/cgroup OOM killer sends
    24: RESOURCE_EXHAUSTED,  # SIGXCPU: CPU time limit
    25: RESOURCE_EXHAUSTED,  # SIGXFSZ: file size limit
    15: CANCELLED,  # SIGTERM: orderly shutdown (deploy, scale-down)
    2: CANCELLED,  # SIGINT
    1: CANCELLED,  # SIGHUP
}


def classify_exception(exc: BaseException) -> str:
    """Failure class of an exception raised while parsing. Never NO_DATA."""
    import asyncio

    if isinstance(exc, (MemoryError, TimeoutError, asyncio.TimeoutError)):
        return RESOURCE_EXHAUSTED
    if isinstance(exc, (asyncio.CancelledError, KeyboardInterrupt, SystemExit, GeneratorExit)):
        return CANCELLED
    return PARSER_FAILURE


def classify_child_exit(returncode: int | None, *, timed_out: bool = False) -> str | None:
    """Failure class of a parser child process, or None when it succeeded.

    `returncode` follows subprocess semantics: negative N means "killed by
    signal N". A child that is killed is never a statement about the demo.
    Crash signals (SIGSEGV, SIGABRT, SIGBUS, ...) are PARSER_FAILURE.
    """
    if timed_out:
        return RESOURCE_EXHAUSTED
    if returncode is None:
        return PARSER_FAILURE
    if returncode == 0:
        return None
    if returncode < 0:
        return _SIGNAL_CLASS.get(-returncode, PARSER_FAILURE)
    # Shells report "killed by signal N" as 128+N; some supervisors pass it on.
    if returncode > 128 and (returncode - 128) in _SIGNAL_CLASS:
        return _SIGNAL_CLASS[returncode - 128]
    return PARSER_FAILURE


class WorkerError(Exception):
    """An error with a wire code + HTTP status + externally safe message."""

    def __init__(self, status_code: int, error_code: str, message: str, *,
                 failure_class: str | None = None) -> None:
        if error_code not in WORKER_ERROR_CODES:
            # Never invent a code outside the official matrix.
            raise WorkerConfigurationError(f"unknown worker error code: {error_code}")
        if failure_class is not None and failure_class not in FAILURE_CLASSES:
            raise WorkerConfigurationError(f"unknown failure class: {failure_class}")
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        # Internal only: never part of envelope(), never sent to the APP.
        self.failure_class = failure_class

    def envelope(self) -> dict[str, dict[str, str]]:
        return {"detail": {"error_code": self.error_code, "message": self.message}}


class InvalidDemoError(Exception):
    """Positive evidence that the file is not a demo this parser can read."""


class CorruptedDemoError(Exception):
    """Positive evidence that the demo bytes are truncated/corrupted."""


class UnsupportedDemoError(Exception):
    """A known-but-unsupported demo variant (for example a GOTV/CS:GO demo)."""
