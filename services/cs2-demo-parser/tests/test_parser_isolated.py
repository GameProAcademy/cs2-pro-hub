"""The killable parser boundary, exercised with REAL child processes.

Each test replaces only the command the boundary launches; the process
handling, the exit-status classification and the result validation under test
are the production code paths.
"""
from __future__ import annotations

import asyncio
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

import errors as E
import parser_isolated
from conftest import DEMO_BYTES, DEMO_SHA, make_settings
from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError, WorkerError

pytestmark = pytest.mark.skipif(os.name != "posix", reason="POSIX process semantics")

GOOD = {"header": {"map": "de_test"}, "players": [], "rounds": [], "events": [], "warnings": []}


def child(monkeypatch, body: str) -> None:
    """Make the boundary launch `python -c <body>`; argv[1]=demo, argv[2]=result path."""
    code = "import json, os, signal, sys, time\ndemo, out = sys.argv[1], sys.argv[2]\n" + body
    monkeypatch.setattr(parser_isolated, "_command", lambda demo, result: [sys.executable, "-c", code, demo, str(result)])


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    # A zombie still answers signal 0; it is dead for our purposes.
    try:
        return Path(f"/proc/{pid}/stat").read_text().split(") ", 1)[1].split()[0] != "Z"
    except OSError:
        return False


def wait_dead(pid: int, seconds: float = 5.0) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if not alive(pid):
            return True
        time.sleep(0.05)
    return not alive(pid)


def run_sync(timeout: float | None = 20.0):
    return parser_isolated.parse_demo_file_isolated("demo.dem", timeout)


def run_async(timeout: float = 20.0):
    return asyncio.run(parser_isolated.parse_isolated_async("demo.dem", timeout))


@pytest.mark.parametrize("runner", [run_sync, run_async])
def test_success_returns_the_child_result(monkeypatch, runner):
    child(monkeypatch, f"open(out, 'w').write(json.dumps({{'ok': True, 'result': {GOOD!r}}}))")
    assert runner() == GOOD


@pytest.mark.parametrize("runner", [run_sync, run_async])
@pytest.mark.parametrize("sig, expected", [
    (signal.SIGKILL, E.RESOURCE_EXHAUSTED),
    (signal.SIGTERM, E.CANCELLED),
    (signal.SIGSEGV, E.PARSER_FAILURE),
    (signal.SIGABRT, E.PARSER_FAILURE),
])
def test_child_killed_by_signal_is_classified_and_never_a_result(monkeypatch, runner, sig, expected):
    # The child even leaves a perfectly valid result behind before dying:
    # a killed process is never trusted.
    child(monkeypatch, f"open(out, 'w').write(json.dumps({{'ok': True, 'result': {GOOD!r}}}))\n"
                       f"os.kill(os.getpid(), {int(sig)})")
    with pytest.raises(WorkerError) as caught:
        runner()
    assert caught.value.error_code == "PARSER_ERROR"  # wire code unchanged
    assert caught.value.failure_class == expected
    assert caught.value.envelope() == {"detail": {"error_code": "PARSER_ERROR", "message": "Parser failed unexpectedly."}}


@pytest.mark.parametrize("body", [
    "pass",  # exit 0, no file at all
    "open(out, 'w').write('{not json')",
    "open(out, 'w').write(json.dumps([1, 2, 3]))",
    "open(out, 'w').write(json.dumps({'ok': True}))",
    "open(out, 'w').write(json.dumps({'ok': True, 'result': []}))",
    "open(out, 'w').write(json.dumps({'ok': 'yes', 'result': {}}))",
    "open(out, 'w').write(json.dumps({'ok': False, 'error_type': 'Whatever'}))",
    "open(out, 'w').write(json.dumps({'ok': False, 'error_type': 'X', 'failure_class': 'NO_DATA'}))",
    "open(out, 'wb').write(b'\\xff\\xfe\\x00')",
])
def test_malformed_output_is_invalid_output_never_a_result(monkeypatch, body):
    child(monkeypatch, body)
    with pytest.raises(WorkerError) as caught:
        run_sync()
    assert caught.value.failure_class == E.INVALID_OUTPUT
    assert caught.value.error_code == "PARSER_ERROR"


@pytest.mark.parametrize("name, exc", [
    ("InvalidDemoError", InvalidDemoError),
    ("CorruptedDemoError", CorruptedDemoError),
    ("UnsupportedDemoError", UnsupportedDemoError),
])
def test_demo_defects_keep_their_own_exceptions(monkeypatch, name, exc):
    child(monkeypatch, f"open(out, 'w').write(json.dumps({{'ok': False, 'error_type': '{name}'}}))")
    with pytest.raises(exc):
        run_sync()


def test_typed_demo_error_from_a_dying_child_is_not_trusted(monkeypatch):
    child(monkeypatch, "open(out, 'w').write(json.dumps({'ok': False, 'error_type': 'CorruptedDemoError'}))\n"
                       "os.kill(os.getpid(), signal.SIGKILL)")
    with pytest.raises(WorkerError) as caught:
        run_sync()
    assert caught.value.failure_class == E.RESOURCE_EXHAUSTED


def test_resource_class_claimed_with_exit_0_is_not_accepted(monkeypatch):
    # RESOURCE_EXHAUSTED / CANCELLED must come with the failure exit status.
    for claimed in (E.RESOURCE_EXHAUSTED, E.CANCELLED):
        child(monkeypatch, f"open(out, 'w').write(json.dumps({{'ok': False, 'error_type': 'X', 'failure_class': '{claimed}'}}))")
        with pytest.raises(WorkerError) as caught:
            run_sync()
        assert caught.value.failure_class == E.INVALID_OUTPUT


def test_failure_exit_without_a_report_is_invalid_output(monkeypatch):
    for body in ("sys.exit(3)", "open(out, 'w').write(json.dumps({'ok': True, 'result': {}}))\nsys.exit(3)"):
        child(monkeypatch, body)
        with pytest.raises(WorkerError) as caught:
            run_sync()
        assert caught.value.failure_class == E.INVALID_OUTPUT


def test_other_non_zero_exit_is_a_parser_failure(monkeypatch):
    child(monkeypatch, f"open(out, 'w').write(json.dumps({{'ok': True, 'result': {GOOD!r}}}))\nsys.exit(1)")
    with pytest.raises(WorkerError) as caught:
        run_sync()
    assert caught.value.failure_class == E.PARSER_FAILURE


@pytest.mark.parametrize("reported, exit_code", [
    (E.RESOURCE_EXHAUSTED, 3), (E.CANCELLED, 3), (E.PARSER_FAILURE, 0),
])
def test_class_reported_by_the_child_is_used(monkeypatch, reported, exit_code):
    child(monkeypatch, f"open(out, 'w').write(json.dumps({{'ok': False, 'error_type': 'MemoryError', "
                       f"'failure_class': '{reported}'}}))\nsys.exit({exit_code})")
    with pytest.raises(WorkerError) as caught:
        run_sync()
    assert caught.value.failure_class == reported


def test_real_memory_limit_in_a_child_is_resource_exhaustion(monkeypatch):
    child(monkeypatch,
          "import resource\n"
          "resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024,) * 2)\n"
          "try:\n"
          "    block = bytearray(2 * 1024 ** 3)\n"
          "    open(out, 'w').write(json.dumps({'ok': True, 'result': {}}))\n"
          "except MemoryError:\n"
          "    open(out, 'w').write(json.dumps({'ok': False, 'error_type': 'MemoryError', 'failure_class': 'RESOURCE_EXHAUSTED'}))\n"
          "    sys.exit(3)\n")
    with pytest.raises(WorkerError) as caught:
        run_sync()
    assert caught.value.failure_class == E.RESOURCE_EXHAUSTED


HANG = (
    "import subprocess\n"
    "grand = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])\n"
    "open(demo + '.pids', 'w').write(f'{os.getpid()} {grand.pid}')\n"
    "time.sleep(120)\n"
)


def _pids(marker: Path) -> tuple[int, int]:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            first, second = marker.read_text().split()
            return int(first), int(second)
        except (OSError, ValueError):
            time.sleep(0.05)
    raise AssertionError("child never started")


@pytest.mark.parametrize("mode", ["sync", "async"])
def test_timeout_kills_the_parser_and_its_descendants(monkeypatch, tmp_path, mode):
    child(monkeypatch, HANG)
    demo = str(tmp_path / "demo.dem")
    started = time.monotonic()
    with pytest.raises(WorkerError) as caught:
        if mode == "sync":
            parser_isolated.parse_demo_file_isolated(demo, 1.0)
        else:
            asyncio.run(parser_isolated.parse_isolated_async(demo, 1.0))
    assert caught.value.error_code == "PARSE_TIMEOUT" and caught.value.status_code == 504
    assert caught.value.failure_class == E.RESOURCE_EXHAUSTED
    assert time.monotonic() - started < 15
    parent_pid, grandchild_pid = _pids(Path(demo + ".pids"))
    # The work is really interrupted: neither the parser process nor anything
    # it spawned is left running.
    assert wait_dead(parent_pid) and wait_dead(grandchild_pid)


def test_cancellation_kills_the_parser_process(monkeypatch, tmp_path):
    child(monkeypatch, HANG)
    demo = str(tmp_path / "demo.dem")

    async def scenario():
        task = asyncio.ensure_future(parser_isolated.parse_isolated_async(demo, 60.0))
        pids = await asyncio.to_thread(_pids, Path(demo + ".pids"))
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        return pids

    parent_pid, grandchild_pid = asyncio.run(scenario())
    assert wait_dead(parent_pid) and wait_dead(grandchild_pid)


def test_no_result_file_is_left_behind(monkeypatch, tmp_path):
    seen: list[Path] = []
    original = parser_isolated._result_path

    def tracking():
        path = original()
        seen.append(path)
        return path

    monkeypatch.setattr(parser_isolated, "_result_path", tracking)
    child(monkeypatch, f"open(out, 'w').write(json.dumps({{'ok': True, 'result': {GOOD!r}}}))")
    run_sync()
    child(monkeypatch, "os.kill(os.getpid(), signal.SIGKILL)")
    with pytest.raises(WorkerError):
        run_sync()
    assert seen and not any(path.exists() for path in seen)


def test_the_parse_wrapper_uses_the_killable_boundary_and_times_out_for_real(monkeypatch, tmp_path):
    import app

    child(monkeypatch, HANG.replace("demo + '.pids'", f"{str(tmp_path / 'pids')!r}"))
    demo = tmp_path / "demo.dem"
    demo.write_bytes(DEMO_BYTES)

    async def download(_url, _size, _settings):
        return str(demo), DEMO_SHA, len(DEMO_BYTES)

    monkeypatch.setattr(app, "_download", download)
    body = app.ParseRequest(contract_version=1, upload_id="22222222-2222-2222-2222-222222222222",
                            demo_url="https://storage.example/demo.dem", demo_sha256=DEMO_SHA,
                            file_size=len(DEMO_BYTES))
    with pytest.raises(WorkerError) as caught:
        asyncio.run(app._parse_downloaded(body, make_settings(parse_timeout_seconds=1.0),
                                          parser_isolated.parse_demo_file_isolated, finalize_raw=False))
    assert caught.value.error_code == "PARSE_TIMEOUT"
    assert caught.value.failure_class == E.RESOURCE_EXHAUSTED
    parent_pid, grandchild_pid = _pids(tmp_path / "pids")
    assert wait_dead(parent_pid) and wait_dead(grandchild_pid)
    assert not demo.exists()  # the temporary demo is removed on the failure path too


def test_production_default_is_the_isolated_boundary():
    import app

    assert app.parse_demo_file_isolated is parser_isolated.parse_demo_file_isolated
    assert parser_isolated.parse_demo_file_isolated.run_async is parser_isolated.parse_isolated_async
    source = Path(app.__file__).read_text()
    assert "parse = parse_fn or parse_demo_file_isolated" in source


def test_real_child_module_rejects_a_non_demo_and_refuses_to_run_standalone(tmp_path):
    bad = tmp_path / "not-a-demo.dem"
    bad.write_bytes(b"PBDEMS2\x00" + b"\x00" * 64)
    # Through the boundary: the REAL parser_child runs the REAL parser entry
    # point and reports a demo defect (the file fails the structure gate).
    with pytest.raises((InvalidDemoError, CorruptedDemoError, UnsupportedDemoError)):
        parser_isolated.parse_demo_file_isolated(str(bad), 60.0)
    # Stand-alone, without the parent handshake, it does nothing.
    result = tmp_path / "result.json"
    env = {key: value for key, value in os.environ.items() if key != "PARSER_CHILD_PARENT_PID"}
    done = subprocess.run([sys.executable, "-m", "parser_child", str(bad), str(result)],
                          cwd=os.path.dirname(parser_isolated.__file__), env=env, capture_output=True, timeout=60)
    assert done.returncode == 77 and not result.exists()


# ---- the REAL child module, with only the parser function replaced ----------
def real_child(monkeypatch, tmp_path, parser_body: str) -> None:
    """Run the real `parser_child` module as __main__; a stub `parser` module supplies the result."""
    stub = tmp_path / "stub"
    stub.mkdir(exist_ok=True)
    (stub / "parser.py").write_text("NON_DEMO_FAILURES = (MemoryError, KeyboardInterrupt, SystemExit)\n" + parser_body)
    code = ("import runpy, sys\n"
            f"sys.path.insert(0, {str(stub)!r})\n"
            "sys.argv = ['parser_child', sys.argv[1], sys.argv[2]]\n"
            "runpy.run_module('parser_child', run_name='__main__')\n")
    monkeypatch.setattr(parser_isolated, "_command", lambda demo, result: [sys.executable, "-c", code, demo, str(result)])


def same(left, right) -> bool:
    """Deep equality where NaN equals NaN."""
    if isinstance(left, float) and isinstance(right, float):
        return (left != left and right != right) or left == right
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(same(left[key], right[key]) for key in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(same(a, b) for a, b in zip(left, right))
    return type(left) is type(right) and left == right


@pytest.mark.parametrize("runner", [run_sync, run_async])
def test_nan_and_infinite_floats_cross_the_real_child_boundary_unchanged(monkeypatch, tmp_path, runner):
    """Real demos carry NaN for unset float properties. The child refused them
    (allow_nan=False) and exited 1, so every real demo failed as PARSER_ERROR."""
    real_child(monkeypatch, tmp_path,
               "def parse_demo_file(_path):\n"
               "    return {'header': {'map': 'de_test'}, 'players': [{'x': float('nan'), 'y': float('inf'),\n"
               "            'z': float('-inf'), 'n': None, 'k': 1, 'f': 0.1, 's': 'é', 'b': True}],\n"
               "            'rounds': [], 'events': [[1, 2.5, 'a']], 'warnings': []}\n")
    expected = {"header": {"map": "de_test"}, "players": [{"x": float("nan"), "y": float("inf"), "z": float("-inf"),
                                                           "n": None, "k": 1, "f": 0.1, "s": "é", "b": True}],
                "rounds": [], "events": [[1, 2.5, "a"]], "warnings": []}
    assert same(runner(), expected)


@pytest.mark.parametrize("runner", [run_sync, run_async])
def test_a_result_that_cannot_be_serialized_is_invalid_output_not_a_crash(monkeypatch, tmp_path, runner):
    real_child(monkeypatch, tmp_path,
               "def parse_demo_file(_path):\n    return {'header': {'blob': b'bytes'}, 'players': []}\n")
    with pytest.raises(WorkerError) as caught:
        runner()
    assert caught.value.error_code == E.PARSER_ERROR and caught.value.failure_class == E.INVALID_OUTPUT


@pytest.mark.parametrize("runner", [run_sync, run_async])
def test_typed_demo_errors_and_memory_errors_from_the_real_child(monkeypatch, tmp_path, runner):
    real_child(monkeypatch, tmp_path,
               "from errors import CorruptedDemoError\n"
               "def parse_demo_file(_path):\n    raise CorruptedDemoError('x')\n")
    with pytest.raises(CorruptedDemoError):
        runner()
    real_child(monkeypatch, tmp_path, "def parse_demo_file(_path):\n    raise MemoryError()\n")
    with pytest.raises(WorkerError) as caught:
        runner()
    assert caught.value.failure_class == E.RESOURCE_EXHAUSTED


# ---- the parser must not outlive a worker that is killed ---------------------
def test_the_parser_child_dies_when_its_worker_is_sigkilled(tmp_path):
    """A worker killed by SIGKILL cannot clean up. The child runs in its own
    session, so killing the worker's group does not reach it; the kernel must."""
    service = str(Path(parser_isolated.__file__).resolve().parent)
    stub = tmp_path / "stub"
    stub.mkdir()
    pid_file = tmp_path / "child.pid"
    (stub / "parser.py").write_text(
        "import os, time\nNON_DEMO_FAILURES = (MemoryError,)\n"
        f"def parse_demo_file(_path):\n    open({str(pid_file)!r}, 'w').write(str(os.getpid()))\n    time.sleep(600)\n")
    worker_code = (
        "import sys\n"
        f"sys.path.insert(0, {service!r})\n"
        "import parser_isolated\n"
        f"stub = {str(stub)!r}\n"
        "code = ('import runpy, sys\\n' + f'sys.path.insert(0, {stub!r})\\n' +\n"
        "        \"sys.argv = ['parser_child', sys.argv[1], sys.argv[2]]\\n\" +\n"
        "        \"runpy.run_module('parser_child', run_name='__main__')\\n\")\n"
        "parser_isolated._command = lambda demo, result: [sys.executable, '-c', code, demo, str(result)]\n"
        "parser_isolated.parse_demo_file_isolated('demo.dem', 600)\n"
    )
    worker = subprocess.Popen([sys.executable, "-c", worker_code], cwd=service, start_new_session=True,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 20
        while not pid_file.exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        child_pid = int(pid_file.read_text())
        assert alive(child_pid) and alive(worker.pid)
        os.killpg(worker.pid, signal.SIGKILL)  # the worker's group; the child is in its own session
        worker.wait()
        assert wait_dead(child_pid, 10), "the parser child outlived its SIGKILLed worker"
    finally:
        if worker.poll() is None:
            os.killpg(worker.pid, signal.SIGKILL)
        try:
            os.kill(int(pid_file.read_text()), signal.SIGKILL)
        except (OSError, ValueError):
            pass
