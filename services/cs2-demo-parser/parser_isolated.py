"""Process-isolated production boundary for demoparser2.

The durable worker must survive native parser crashes. demoparser2 is a Rust
native extension, so executing it in the consumer process means a SIGSEGV or
SIGABRT can terminate the entire Railway worker before the job failure RPC is
sent. This wrapper runs the existing parser boundary in a dedicated child
process and turns child crashes/timeouts into normal WorkerError values.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError, WorkerError
import errors as E

logger = logging.getLogger("cs2-demo-parser")


def _child_timeout_seconds() -> float:
    # Keep the child timeout slightly below app.py's outer asyncio timeout so
    # the parsing thread gets a deterministic result before its outer deadline.
    try:
        configured = float(os.getenv("PARSE_TIMEOUT_SECONDS", "240"))
    except ValueError:
        configured = 240.0
    return max(30.0, configured - 10.0)


def _read_result(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise WorkerError(500, E.PARSER_ERROR, "Parser child returned no valid result.") from exc
    if not isinstance(payload, dict):
        raise WorkerError(500, E.PARSER_ERROR, "Parser child returned an invalid result.")
    return payload


def parse_demo_file_isolated(path: str) -> dict[str, Any]:
    """Run the existing parser boundary in a killable child process."""
    result_handle = tempfile.NamedTemporaryFile(
        prefix="parser-result-", suffix=".json", delete=False
    )
    result_path = Path(result_handle.name)
    result_handle.close()

    command = [sys.executable, "-m", "parser_child", path, str(result_path)]
    try:
        try:
            completed = subprocess.run(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                timeout=_child_timeout_seconds(),
                cwd=os.path.dirname(__file__),
            )
        except subprocess.TimeoutExpired:
            logger.error("parser_child_timeout path=%s", path)
            raise WorkerError(504, E.PARSE_TIMEOUT, "Parsing timed out.") from None
        except OSError as exc:
            logger.exception("parser_child_spawn_failed type=%s", type(exc).__name__)
            raise WorkerError(500, E.PARSER_ERROR, "Parser process could not start.") from None

        stdout = (completed.stdout or "").strip()
        if stdout:
            # The child intentionally emits only bounded, non-secret diagnostics.
            # Preserve the tail for production observability; never expose it via
            # the external API.
            logger.info("parser_child_stdout diagnostic=%s", stdout[-2000:])

        stderr = (completed.stderr or "").strip()
        if completed.returncode != 0:
            # Negative return codes on POSIX identify the terminating signal
            # (e.g. -11 for SIGSEGV). Keep diagnostics bounded and never expose
            # them through the external API; they are server-side logs only.
            diagnostic = stderr[-2000:] if stderr else "no stderr"
            logger.error(
                "parser_child_exit returncode=%s diagnostic=%s",
                completed.returncode,
                diagnostic,
            )
            raise WorkerError(500, E.PARSER_ERROR, "Parser process failed unexpectedly.")

        payload = _read_result(result_path)
        if payload.get("ok") is True and isinstance(payload.get("result"), dict):
            return payload["result"]

        error_type = payload.get("error_type")
        message = payload.get("message")
        if error_type == "InvalidDemoError":
            raise InvalidDemoError(str(message or "invalid demo"))
        if error_type == "CorruptedDemoError":
            raise CorruptedDemoError(str(message or "corrupted demo"))
        if error_type == "UnsupportedDemoError":
            raise UnsupportedDemoError(str(message or "unsupported demo"))
        raise WorkerError(500, E.PARSER_ERROR, "Parser failed unexpectedly.")
    finally:
        try:
            result_path.unlink()
        except OSError:
            pass
