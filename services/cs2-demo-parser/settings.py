"""Worker settings, including the GATE 1E.1 revision lock.

Rules enforced here:

* `PARSER_TOKEN` is mandatory. Without it the worker refuses to start.
* `PARSER_REVISION` identifies the deployed build immutably. In production it is
  mandatory and there is NO silent fallback (`pypi-0.42.0` is gone for good).
* A development fallback exists, but it only applies outside production and it is
  explicitly marked as unpinned so it can never be mistaken for a real build id.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass

from errors import WorkerConfigurationError

PARSER_NAME = "demoparser2"
PARSER_VERSION = "0.42.0"
DURABLE_HOT_TARGET_BYTES = 4 * 1024 * 1024
DURABLE_HOT_HARD_MAX_BYTES = 8 * 1024 * 1024

#: JSON contract spoken with the APP. Different concept from the parser version.
DEFAULT_CONTRACT_VERSION = 1
SUPPORTED_CONTRACT_VERSIONS: frozenset[int] = frozenset({1})

#: Marker used ONLY outside production. It is deliberately not a build id.
DEV_UNPINNED_REVISION = "dev:unpinned"

#: Production uses the source commit itself as the immutable build identity.
_GIT_REVISION = re.compile(r"^git:[0-9a-f]{40}$")
_OPAQUE_REVISION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:+/-]{6,127}$")

#: Values historically used as a silent fallback. Rejected everywhere.
FORBIDDEN_REVISIONS = frozenset({"pypi-0.42.0", "pypi-" + PARSER_VERSION, "unknown", "none"})


def is_valid_revision(value: str | None) -> bool:
    if value is None:
        return False
    candidate = value.strip()
    if not candidate or candidate.lower() in FORBIDDEN_REVISIONS:
        return False
    if candidate == DEV_UNPINNED_REVISION:
        return False
    return bool(_GIT_REVISION.match(candidate) or _OPAQUE_REVISION.match(candidate))


@dataclass(frozen=True)
class Settings:
    token: str
    revision: str
    contract_version: int
    environment: str
    max_demo_bytes: int
    max_payload_bytes: int
    download_timeout_seconds: float
    parse_timeout_seconds: float
    bridge_url: str | None = None
    bridge_secret: str | None = None
    worker_id: str = "railway-parser-1"
    queue_poll_seconds: float = 5.0
    queue_heartbeat_seconds: float = 60.0

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def revision_is_pinned(self) -> bool:
        return self.revision != DEV_UNPINNED_REVISION


def _int_env(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:  # pragma: no cover - defensive
        raise WorkerConfigurationError(f"{name} must be an integer") from exc
    if value <= 0:
        raise WorkerConfigurationError(f"{name} must be positive")
    return value


def _float_env(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError as exc:  # pragma: no cover - defensive
        raise WorkerConfigurationError(f"{name} must be a number") from exc
    if value <= 0:
        raise WorkerConfigurationError(f"{name} must be positive")
    return value


def resolve_revision(raw: str | None, *, environment: str) -> str:
    """Resolve the immutable build revision, failing closed in production."""
    candidate = (raw or "").strip()
    if environment == "production" and _GIT_REVISION.fullmatch(candidate):
        return candidate
    if environment != "production" and is_valid_revision(candidate):
        return candidate
    if environment == "production":
        raise WorkerConfigurationError(
            "PARSER_REVISION is required in production and must be an immutable "
            "build identifier (preferred form: git:<full-commit-sha>)"
        )
    # Outside production only: explicitly unpinned, never a fake build id.
    return DEV_UNPINNED_REVISION


def load_settings(env: dict[str, str] | None = None) -> Settings:
    source = os.environ if env is None else env
    previous = None
    if env is not None:
        previous = dict(os.environ)
        os.environ.clear()
        os.environ.update(env)
    try:
        environment = (source.get("ENVIRONMENT") or "production").strip().lower()
        token = (source.get("PARSER_TOKEN") or "").strip()
        if not token:
            raise WorkerConfigurationError("PARSER_TOKEN is required")
        contract_version = _int_env("PARSER_CONTRACT_VERSION", DEFAULT_CONTRACT_VERSION)
        if contract_version not in SUPPORTED_CONTRACT_VERSIONS:
            raise WorkerConfigurationError(
                f"PARSER_CONTRACT_VERSION {contract_version} is not supported by this build"
            )
        revision = resolve_revision(source.get("PARSER_REVISION"), environment=environment)
        return Settings(
            token=token,
            revision=revision,
            contract_version=contract_version,
            environment=environment,
            max_demo_bytes=_int_env("MAX_DEMO_BYTES", 1_500 * 1024 * 1024),
            max_payload_bytes=min(
                _int_env("MAX_PAYLOAD_BYTES", DURABLE_HOT_HARD_MAX_BYTES),
                DURABLE_HOT_HARD_MAX_BYTES,
            ),
            download_timeout_seconds=_float_env("DOWNLOAD_TIMEOUT_SECONDS", 120.0),
            parse_timeout_seconds=_float_env("PARSE_TIMEOUT_SECONDS", 240.0),
            bridge_url=(source.get("DEMO_PIPELINE_BRIDGE_URL") or "").strip().rstrip("/") or None,
            bridge_secret=(source.get("DEMO_PIPELINE_BRIDGE_SECRET") or "").strip() or None,
            worker_id=(source.get("DEMO_PIPELINE_WORKER_ID") or "railway-parser-1").strip(),
            queue_poll_seconds=_float_env("DEMO_QUEUE_POLL_SECONDS", 5.0),
            queue_heartbeat_seconds=_float_env("DEMO_QUEUE_HEARTBEAT_SECONDS", 60.0),
        )
    finally:
        if previous is not None:
            os.environ.clear()
            os.environ.update(previous)
