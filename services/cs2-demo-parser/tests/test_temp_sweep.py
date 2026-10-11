"""Temporary files left by a killed worker are removed at startup, and nothing else is."""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

import app as app_module
from conftest import make_settings

pytestmark = pytest.mark.skipif(os.name != "posix", reason="POSIX process semantics")
SETTINGS = make_settings(download_timeout_seconds=5.0, parse_timeout_seconds=5.0)  # min age: 130 s
OLD = 1000.0


def age(path: Path, seconds: float) -> None:
    stamp = time.time() - seconds
    os.utime(path, (stamp, stamp), follow_symlinks=False)


def killed_while_holding(tmp_path: Path, prefix: str, suffix: str) -> Path:
    """A real process creates the file exactly as the worker does and is SIGKILLed."""
    code = ("import sys, tempfile, time\n"
            f"handle = tempfile.NamedTemporaryFile(prefix={prefix!r}, suffix={suffix!r}, dir=sys.argv[1], delete=False)\n"
            "handle.write(b'x' * 4096); handle.flush(); print(handle.name, flush=True); time.sleep(600)\n")
    process = subprocess.Popen([sys.executable, "-c", code, str(tmp_path)], stdout=subprocess.PIPE, text=True)
    path = Path(process.stdout.readline().strip())
    process.send_signal(signal.SIGKILL)
    process.wait()
    assert path.exists(), "the killed process must leave its file behind"
    return path


def test_a_demo_left_by_a_worker_killed_during_download_is_removed(tmp_path):
    orphan = killed_while_holding(tmp_path, "demo-", ".dem")
    age(orphan, OLD)
    assert app_module.sweep_orphan_temp_files(SETTINGS, directory=str(tmp_path)) == {"removed": 1, "bytes": 4096, "kept": 0}
    assert not orphan.exists()


def test_a_result_left_by_a_worker_killed_during_parsing_is_removed(tmp_path):
    result = killed_while_holding(tmp_path, "parser-result-", ".json")
    partial = tmp_path / (result.name + ".abc123.tmp")
    partial.write_bytes(b"{")
    age(result, OLD)
    age(partial, OLD)
    assert app_module.sweep_orphan_temp_files(SETTINGS, directory=str(tmp_path))["removed"] == 2
    assert list(tmp_path.iterdir()) == []


def test_a_file_an_active_execution_may_still_use_is_kept(tmp_path):
    downloading = killed_while_holding(tmp_path, "demo-", ".dem")  # just written
    parsing = tmp_path / "demo-parsing1.dem"
    parsing.write_bytes(b"x")
    age(parsing, 100)  # written 100 s ago, a parse may still be reading it
    assert app_module.sweep_orphan_temp_files(SETTINGS, directory=str(tmp_path)) == {"removed": 0, "bytes": 0, "kept": 2}
    assert downloading.exists() and parsing.exists()


def test_only_names_the_worker_creates_are_considered(tmp_path):
    for name in ("important.dem", "demo-.dem", "demo-abc.dem.bak", "xdemo-abc.dem", "parser-result-abc.txt",
                 "demo-a b.dem", "demo-" + "a" * 40 + ".dem"):
        path = tmp_path / name
        path.write_bytes(b"x")
        age(path, OLD)
    nested = tmp_path / "sub"
    nested.mkdir()
    inner = nested / "demo-inner1.dem"
    inner.write_bytes(b"x")
    age(inner, OLD)
    before = sorted(p.name for p in tmp_path.rglob("*"))
    assert app_module.sweep_orphan_temp_files(SETTINGS, directory=str(tmp_path))["removed"] == 0
    assert sorted(p.name for p in tmp_path.rglob("*")) == before


def test_a_symlink_is_never_followed_or_removed(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    target = outside / "precious.dat"
    target.write_bytes(b"keep me")
    age(target, OLD)
    scan = tmp_path / "scan"
    scan.mkdir()
    link = scan / "demo-link1.dem"
    link.symlink_to(target)
    age(link, OLD)
    directory = scan / "demo-dir1.dem"
    directory.mkdir()
    assert app_module.sweep_orphan_temp_files(SETTINGS, directory=str(scan))["removed"] == 0
    assert target.read_bytes() == b"keep me" and link.is_symlink() and directory.is_dir()


def test_the_temp_directory_itself_may_not_be_a_symlink(tmp_path):
    real = tmp_path / "real"
    real.mkdir()
    orphan = real / "demo-abc123.dem"
    orphan.write_bytes(b"x")
    age(orphan, OLD)
    alias = tmp_path / "alias"
    alias.symlink_to(real, target_is_directory=True)
    assert app_module.sweep_orphan_temp_files(SETTINGS, directory=str(alias)) == {"removed": 0, "bytes": 0, "kept": 0}
    assert orphan.exists()


def test_a_file_owned_by_someone_else_is_kept(tmp_path, monkeypatch):
    orphan = tmp_path / "demo-abc123.dem"
    orphan.write_bytes(b"x")
    age(orphan, OLD)
    monkeypatch.setattr(app_module.os, "geteuid", lambda: os.stat(orphan).st_uid + 1)
    assert app_module.sweep_orphan_temp_files(SETTINGS, directory=str(tmp_path)) == {"removed": 0, "bytes": 0, "kept": 1}
    assert orphan.exists()


def test_names_are_not_logged(tmp_path, caplog):
    orphan = tmp_path / "demo-secretname.dem"
    orphan.write_bytes(b"x")
    age(orphan, OLD)
    with caplog.at_level("INFO"):
        app_module.sweep_orphan_temp_files(SETTINGS, directory=str(tmp_path))
    assert "secretname" not in caplog.text and str(tmp_path) not in caplog.text
    assert "temp_sweep removed=1" in caplog.text


def test_the_sweep_runs_when_the_app_starts(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    orphan = tmp_path / "demo-startup1.dem"
    orphan.write_bytes(b"x")
    age(orphan, OLD)
    monkeypatch.setattr(app_module.tempfile, "tempdir", str(tmp_path))
    with TestClient(app_module.create_app(SETTINGS, parse_fn=lambda _path: {})):
        pass
    assert not orphan.exists()
