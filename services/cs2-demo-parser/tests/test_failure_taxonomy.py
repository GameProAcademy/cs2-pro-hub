"""Failure classes: what happened, without changing what the APP sees.

The wire protocol is frozen here on purpose. Every test that touches an error
envelope asserts that no new key and no new code reaches it.
"""
from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import sys
import threading
import time

import pytest

import errors as E
from conftest import DEMO_BYTES, DEMO_SHA, empty_parse, make_settings
from errors import (
    CANCELLED,
    FAILURE_CLASS_WIRE_CODE,
    FAILURE_CLASSES,
    INVALID_OUTPUT,
    NO_DATA,
    PARSER_FAILURE,
    RESOURCE_EXHAUSTED,
    WORKER_ERROR_CODES,
    WorkerConfigurationError,
    WorkerError,
    classify_child_exit,
    classify_exception,
)

WIRE_CODES_FROZEN = (
    "UNAUTHORIZED", "FORBIDDEN", "CONTRACT_MISMATCH", "SAFE_REPLAY_REQUIRES_RECONCILIATION",
    "UNSUPPORTED_CONTRACT_VERSION", "INVALID_DEMO_FORMAT", "CORRUPTED_DEMO", "UNSUPPORTED_DEMO",
    "HASH_MISMATCH", "FILE_SIZE_MISMATCH", "DEMO_TOO_LARGE", "PAYLOAD_TOO_LARGE", "DOWNLOAD_ERROR",
    "DOWNLOAD_FAILED", "TIMEOUT", "PARSE_TIMEOUT", "DOWNLOAD_TIMEOUT", "PARSER_ERROR",
)


def test_wire_codes_are_unchanged_and_classes_are_not_wire_codes():
    assert WORKER_ERROR_CODES == WIRE_CODES_FROZEN
    assert FAILURE_CLASSES == (NO_DATA, PARSER_FAILURE, RESOURCE_EXHAUSTED, CANCELLED, INVALID_OUTPUT)
    # A failure class can never be emitted as a wire code by accident.
    assert not set(FAILURE_CLASSES) & set(WORKER_ERROR_CODES)
    for failure_class in FAILURE_CLASSES:
        with pytest.raises(WorkerConfigurationError):
            WorkerError(500, failure_class, "x")
    # Every failing class maps onto an existing code; NO_DATA is not a failure.
    assert set(FAILURE_CLASS_WIRE_CODE) == set(FAILURE_CLASSES) - {NO_DATA}
    assert set(FAILURE_CLASS_WIRE_CODE.values()) <= set(WORKER_ERROR_CODES)


def test_failure_class_never_reaches_the_envelope():
    error = WorkerError(500, E.PARSER_ERROR, "Parser failed unexpectedly.", failure_class=RESOURCE_EXHAUSTED)
    assert error.failure_class == RESOURCE_EXHAUSTED
    assert error.envelope() == {"detail": {"error_code": "PARSER_ERROR", "message": "Parser failed unexpectedly."}}
    assert WorkerError(500, E.PARSER_ERROR, "x").failure_class is None
    with pytest.raises(WorkerConfigurationError):
        WorkerError(500, E.PARSER_ERROR, "x", failure_class="OUT_OF_MEMORY")


@pytest.mark.parametrize("exc, expected", [
    (MemoryError(), RESOURCE_EXHAUSTED),
    (TimeoutError(), RESOURCE_EXHAUSTED),
    (asyncio.TimeoutError(), RESOURCE_EXHAUSTED),
    (asyncio.CancelledError(), CANCELLED),
    (KeyboardInterrupt(), CANCELLED),
    (SystemExit(1), CANCELLED),
    (GeneratorExit(), CANCELLED),
    (RuntimeError("boom"), PARSER_FAILURE),
    (ValueError("bad"), PARSER_FAILURE),
])
def test_classify_exception(exc, expected):
    assert classify_exception(exc) == expected
    assert classify_exception(exc) != NO_DATA


@pytest.mark.parametrize("returncode, timed_out, expected", [
    (0, False, None),
    (0, True, RESOURCE_EXHAUSTED),
    (-signal.SIGKILL, False, RESOURCE_EXHAUSTED),
    (-signal.SIGXCPU, False, RESOURCE_EXHAUSTED),
    (-signal.SIGTERM, False, CANCELLED),
    (-signal.SIGINT, False, CANCELLED),
    (-signal.SIGSEGV, False, PARSER_FAILURE),
    (-signal.SIGABRT, False, PARSER_FAILURE),
    (137, False, RESOURCE_EXHAUSTED),  # 128 + SIGKILL as reported by a shell
    (143, False, CANCELLED),
    (1, False, PARSER_FAILURE),
    (None, False, PARSER_FAILURE),
])
def test_classify_child_exit_table(returncode, timed_out, expected):
    assert classify_child_exit(returncode, timed_out=timed_out) == expected


def _child(code: str, *, timeout: float = 20.0) -> tuple[int | None, bool]:
    try:
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=timeout, check=False)
        return done.returncode, False
    except subprocess.TimeoutExpired:
        return None, True


@pytest.mark.skipif(os.name != "posix", reason="POSIX signals")
def test_real_child_processes_are_classified_from_their_actual_exit():
    # Killed the way the kernel OOM killer kills: SIGKILL, no chance to report.
    returncode, timed_out = _child("import os, signal; os.kill(os.getpid(), signal.SIGKILL)")
    assert returncode == -signal.SIGKILL
    assert classify_child_exit(returncode, timed_out=timed_out) == RESOURCE_EXHAUSTED

    # Orderly shutdown.
    returncode, timed_out = _child("import os, signal; os.kill(os.getpid(), signal.SIGTERM)")
    assert returncode == -signal.SIGTERM
    assert classify_child_exit(returncode, timed_out=timed_out) == CANCELLED

    # A native crash is a parser failure, not a resource or demo statement.
    returncode, timed_out = _child("import os, signal; os.kill(os.getpid(), signal.SIGSEGV)")
    assert returncode == -signal.SIGSEGV
    assert classify_child_exit(returncode, timed_out=timed_out) == PARSER_FAILURE

    # A hung child is cut off by the supervisor's timeout.
    returncode, timed_out = _child("import time; time.sleep(30)", timeout=0.5)
    assert timed_out is True
    assert classify_child_exit(returncode, timed_out=timed_out) == RESOURCE_EXHAUSTED


@pytest.mark.skipif(os.name != "posix", reason="RLIMIT_AS")
def test_real_child_hitting_a_memory_limit_raises_memory_error_not_empty_output():
    # With an address-space limit the allocation fails inside the child as a
    # MemoryError. The child reports the class; it must never report success.
    code = (
        "import resource, sys\n"
        "resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))\n"
        "try:\n"
        "    block = bytearray(2 * 1024 * 1024 * 1024)\n"
        "    print('ALLOCATED')\n"
        "except MemoryError:\n"
        "    print('MemoryError')\n"
        "    sys.exit(3)\n"
    )
    done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=30, check=False)
    assert done.stdout.strip() == "MemoryError"
    assert done.returncode == 3
    assert classify_exception(MemoryError()) == RESOURCE_EXHAUSTED


def _run_parse(monkeypatch, tmp_path, parse, **settings_overrides):
    import app

    demo = tmp_path / "demo.dem"
    demo.write_bytes(DEMO_BYTES)

    async def download(_url, _size, _settings):
        return str(demo), DEMO_SHA, len(DEMO_BYTES)

    monkeypatch.setattr(app, "_download", download)
    body = app.ParseRequest(contract_version=1, upload_id="22222222-2222-2222-2222-222222222222",
                            demo_url="https://storage.example/demo.dem", demo_sha256=DEMO_SHA,
                            file_size=len(DEMO_BYTES))
    return app._parse_downloaded(body, make_settings(**settings_overrides), parse, finalize_raw=False)


def test_memory_error_during_parse_is_a_failure_never_a_partial_result(monkeypatch, tmp_path):
    def out_of_memory(_path):
        raise MemoryError()

    with pytest.raises(WorkerError) as caught:
        asyncio.run(_run_parse(monkeypatch, tmp_path, out_of_memory))
    assert caught.value.error_code == "PARSER_ERROR"  # wire code unchanged
    assert caught.value.failure_class == RESOURCE_EXHAUSTED
    assert caught.value.envelope() == {
        "detail": {"error_code": "PARSER_ERROR", "message": "Parser failed unexpectedly."}
    }


def test_ordinary_parser_exception_is_parser_failure(monkeypatch, tmp_path):
    def broken(_path):
        raise RuntimeError("unexpected parser state")

    with pytest.raises(WorkerError) as caught:
        asyncio.run(_run_parse(monkeypatch, tmp_path, broken))
    assert caught.value.error_code == "PARSER_ERROR"
    assert caught.value.failure_class == PARSER_FAILURE


def test_parse_timeout_is_resource_exhaustion_with_the_existing_code(monkeypatch, tmp_path):
    release = threading.Event()

    def slow(_path):
        release.wait(5)
        return empty_parse(_path)

    try:
        with pytest.raises(WorkerError) as caught:
            asyncio.run(_run_parse(monkeypatch, tmp_path, slow, parse_timeout_seconds=0.2))
    finally:
        release.set()
    assert caught.value.error_code == "PARSE_TIMEOUT"
    assert caught.value.status_code == 504
    assert caught.value.failure_class == RESOURCE_EXHAUSTED


def test_cancellation_during_parse_is_classified_cancelled_and_yields_no_result(monkeypatch, tmp_path):
    started = threading.Event()
    release = threading.Event()

    def blocking(_path):
        started.set()
        release.wait(5)
        return empty_parse(_path)

    async def scenario():
        task = asyncio.ensure_future(_run_parse(monkeypatch, tmp_path, blocking))
        while not started.is_set():
            await asyncio.sleep(0.01)
        task.cancel()
        try:
            return await task
        finally:
            release.set()

    with pytest.raises(WorkerError) as caught:
        asyncio.run(scenario())
    # Existing behaviour, now labelled: the cancellation surfaces as PARSER_ERROR
    # on the wire and CANCELLED internally. It never returns a payload.
    assert caught.value.error_code == "PARSER_ERROR"
    assert caught.value.failure_class == CANCELLED


def test_demo_defects_keep_their_own_codes_and_are_not_resource_failures(monkeypatch, tmp_path):
    from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError

    for exc, code in ((CorruptedDemoError("x"), "CORRUPTED_DEMO"), (InvalidDemoError("x"), "INVALID_DEMO_FORMAT"),
                      (UnsupportedDemoError("x"), "UNSUPPORTED_DEMO")):
        def rejecting(_path, exc=exc):
            raise exc

        with pytest.raises(WorkerError) as caught:
            asyncio.run(_run_parse(monkeypatch, tmp_path, rejecting))
        assert caught.value.error_code == code
        assert caught.value.failure_class is None


def _consumer_run(monkeypatch, durable):
    """Run one claimed job through durable_consumer_loop; return (bridge calls, ledger events)."""
    import app
    import worker
    from h3e91_execution import ExecutionRecorder
    from worker import durable_consumer_loop

    calls: list[str] = []
    events: list[tuple[str, str | None]] = []

    async def record(_self, event_type, outcome_code=None):
        events.append((event_type, outcome_code))
        return {"status": "INSERTED"}

    async def bridge(_client, _settings, action, _body):
        calls.append(action)
        if action == "claim":
            if calls.count("claim") > 1:
                raise asyncio.CancelledError()
            return {"status": "claimed", "job_id": "11111111-1111-1111-1111-111111111111",
                    "message_id": 7, "attempt": 0, "upload_id": "22222222-2222-2222-2222-222222222222",
                    "user_id": "33333333-3333-3333-3333-333333333333", "attempt_number": 1,
                    "demo_url": "https://synthetic.invalid/demo.dem", "demo_sha256": DEMO_SHA,
                    "file_size": 520, "schema_version": 1}
        return {"accepted": True, "cancelled": False}

    monkeypatch.setattr(ExecutionRecorder, "record", record)
    monkeypatch.setattr(worker, "_bridge", bridge)
    monkeypatch.setattr(app, "_parse_durable_request", durable)
    settings = make_settings(bridge_url="https://synthetic.invalid/api/public/pipeline-worker",
                             bridge_secret="synthetic-test-only")
    try:
        asyncio.run(durable_consumer_loop(settings, empty_parse))
    except asyncio.CancelledError:
        pass
    return calls, events


def test_resource_failure_in_the_durable_loop_fails_the_job_and_never_completes(monkeypatch):
    async def durable(*_args, **kwargs):
        await kwargs["on_started"]()
        raise WorkerError(500, E.PARSER_ERROR, "Parser failed unexpectedly.", failure_class=RESOURCE_EXHAUSTED)

    calls, events = _consumer_run(monkeypatch, durable)
    assert "complete" not in calls
    assert calls.count("fail") == 1
    # One terminal ledger event, a failure, recorded before the queue is told.
    terminals = [event for event in events if event[0] in ("EXECUTION_FINISHED", "EXECUTION_FAILED", "EXECUTION_ABORTED")]
    assert terminals == [("EXECUTION_FAILED", "PARSER_ERROR")]


def test_raw_write_failure_never_completes_and_records_an_interrupted_terminal(monkeypatch):
    """KNOWN GAP, pinned as it is today: a RuntimeError from the RAW writer
    (RAW_CHUNK_TOO_LARGE, a failed chunk upload) is not a WorkerError, so the
    queue is NOT told `fail`. The ledger gets a failed terminal; the job is
    released only when its lease expires."""
    async def durable(*_args, **kwargs):
        await kwargs["on_started"]()
        raise RuntimeError("RAW_CHUNK_TOO_LARGE")

    calls, events = _consumer_run(monkeypatch, durable)
    assert "complete" not in calls  # never a success
    assert ("EXECUTION_FAILED", "WORKER_INTERRUPTED") in events
    assert ("EXECUTION_FINISHED", "PARSE_SUCCEEDED") not in events
    assert "fail" not in calls  # the gap: no queue notification
