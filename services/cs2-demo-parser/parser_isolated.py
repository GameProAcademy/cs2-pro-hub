"""Killable process boundary around the parser.

demoparser2 is native code. Run in a thread of the worker it cannot be
interrupted: a timeout only stops the waiting, and a crash or an out-of-memory
kill takes the whole worker with it. This module runs the parser in a child
process (`parser_child`) so that:

- a timeout or a cancellation KILLS the work (the child's process group);
- the child's exit status is classified (`errors.classify_child_exit`):
  SIGKILL -> RESOURCE_EXHAUSTED, SIGTERM/SIGINT -> CANCELLED, SIGSEGV and other
  crashes -> PARSER_FAILURE;
- a missing, unreadable or malformed result is INVALID_OUTPUT, never a result.

The wire protocol is unchanged: every failure maps onto an existing code and
the class travels only on `WorkerError.failure_class` and in the logs.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import errors as E
from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError, WorkerError

logger = logging.getLogger("cs2-demo-parser")

_HERE = os.path.dirname(os.path.abspath(__file__))
_TYPED = {
    "InvalidDemoError": InvalidDemoError,
    "CorruptedDemoError": CorruptedDemoError,
    "UnsupportedDemoError": UnsupportedDemoError,
}
#: Seconds the child gets to die after SIGKILL before the parent gives up waiting.
_REAP_SECONDS = 10.0
#: Exit status parser_child uses after reporting a non-demo failure itself.
_REPORTED_FAILURE_EXIT = 3


def _command(demo_path: str, result_path: Path) -> list[str]:
    return [sys.executable, "-m", "parser_child", demo_path, str(result_path)]


def _child_env() -> dict[str, str]:
    return {**os.environ, "PARSER_CHILD_PARENT_PID": str(os.getpid())}


def _result_path(directory: str | None = None) -> Path:
    handle = tempfile.NamedTemporaryFile(prefix="parser-result-", suffix=".json", dir=directory, delete=False)
    handle.close()
    path = Path(handle.name)
    path.unlink()  # the child creates it atomically; absence means "no result"
    return path


def _kill_group(pid: int) -> None:
    """SIGKILL the child's whole process group; it runs in its own session."""
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def _failure(failure_class: str, detail: str) -> WorkerError:
    logger.error("parser_child_failure failure_class=%s detail=%s", failure_class, detail)
    return WorkerError(500, E.PARSER_ERROR, "Parser failed unexpectedly.", failure_class=failure_class)


def interpret(returncode: int | None, result_path: Path, *, timed_out: bool) -> dict[str, Any]:
    """Turn a finished child (exit status + result file) into a result or an error."""
    if timed_out:
        logger.error("parser_child_timeout failure_class=%s", E.RESOURCE_EXHAUSTED)
        raise WorkerError(504, E.PARSE_TIMEOUT, "Parsing timed out.", failure_class=E.RESOURCE_EXHAUSTED)
    # 1. A child that was killed or crashed: the exit status is the only
    #    trustworthy evidence. Whatever file it left behind is never used.
    if returncode not in (0, _REPORTED_FAILURE_EXIT):
        raise _failure(E.classify_child_exit(returncode) or E.PARSER_FAILURE, f"child_exit returncode={returncode}")
    payload: Any = None
    try:
        payload = json.loads(result_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        payload = None
    # 2. The child ended on its own and says the work failed for a non-demo
    #    reason (memory, cancellation, parser exception).
    if returncode == _REPORTED_FAILURE_EXIT:
        reported = payload.get("failure_class") if isinstance(payload, dict) and payload.get("ok") is False else None
        if reported in (E.RESOURCE_EXHAUSTED, E.CANCELLED, E.PARSER_FAILURE):
            raise _failure(reported, f"child_reported type={str(payload.get('error_type'))[:64]}")
        raise _failure(E.INVALID_OUTPUT, "child_failure_exit_without_valid_report")
    # 3. Exit 0: either a result, a demo defect, a reported parser failure, or
    #    a document that is none of those.
    if isinstance(payload, dict) and payload.get("ok") is False:
        error_type = payload.get("error_type")
        if error_type in _TYPED:
            raise _TYPED[error_type]("demo rejected by the parser")
        if payload.get("failure_class") == E.PARSER_FAILURE:
            raise _failure(E.PARSER_FAILURE, f"child_reported type={str(error_type)[:64]}")
        raise _failure(E.INVALID_OUTPUT, "child_error_document_invalid")
    if not isinstance(payload, dict) or payload.get("ok") is not True or not isinstance(payload.get("result"), dict):
        raise _failure(E.INVALID_OUTPUT, "child_exit_0_without_valid_result")
    return payload["result"]


async def parse_isolated_async(demo_path: str, timeout_seconds: float) -> dict[str, Any]:
    """Parse in a child process; on timeout or cancellation the child is killed."""
    result_path = _result_path(str(Path(demo_path).parent))
    process = await asyncio.create_subprocess_exec(
        *_command(demo_path, result_path),
        cwd=_HERE,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        start_new_session=True,
        env=_child_env(),
    )
    timed_out = False
    try:
        try:
            await asyncio.wait_for(process.wait(), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            timed_out = True
        return interpret(process.returncode, result_path, timed_out=timed_out)
    finally:
        # Reached on success, on every error and on cancellation of the awaiting
        # task: no parser process outlives the request that started it.
        if process.returncode is None:
            _kill_group(process.pid)
            try:
                await asyncio.wait_for(asyncio.shield(process.wait()), timeout=_REAP_SECONDS)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                logger.error("parser_child_not_reaped pid=%s", process.pid)
        try:
            result_path.unlink()
        except OSError:
            pass


def parse_demo_file_isolated(demo_path: str, timeout_seconds: float | None = None) -> dict[str, Any]:
    """Synchronous form of the same boundary, for callers that are not async."""
    result_path = _result_path(str(Path(demo_path).parent))
    process = subprocess.Popen(
        _command(demo_path, result_path),
        cwd=_HERE,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        env=_child_env(),
    )
    timed_out = False
    try:
        try:
            process.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
        return interpret(process.returncode, result_path, timed_out=timed_out)
    finally:
        if process.poll() is None:
            _kill_group(process.pid)
            try:
                process.wait(timeout=_REAP_SECONDS)
            except subprocess.TimeoutExpired:
                logger.error("parser_child_not_reaped pid=%s", process.pid)
        try:
            result_path.unlink()
        except OSError:
            pass


#: `app._parse_downloaded` uses this when present instead of a worker thread.
parse_demo_file_isolated.run_async = parse_isolated_async  # type: ignore[attr-defined]
