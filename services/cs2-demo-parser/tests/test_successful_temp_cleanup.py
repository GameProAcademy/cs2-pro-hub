"""GATE 1E.1 — successful worker runs also leave no temporary demo or result files."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path

import app as app_module
import parser_isolated
from conftest import make_settings


def _worker_temp_files(root: Path) -> list[str]:
    return sorted(
        str(path.relative_to(root))
        for path in root.rglob("*")
        if path.is_file()
        and (
            path.name == "demo.dem"
            or path.name.startswith("demo-")
            or path.name.startswith("parser-result-")
        )
    )


def test_successful_parse_removes_demo_and_result_files(monkeypatch, tmp_path):
    """Exercise the real child-process boundary and app cleanup with a deterministic child parser."""
    monkeypatch.setattr(app_module.tempfile, "tempdir", str(tmp_path))
    monkeypatch.setattr(parser_isolated.tempfile, "tempdir", str(tmp_path))

    demo_bytes = b"PBDEMS2\x00" + b"x" * 64
    demo_sha = hashlib.sha256(demo_bytes).hexdigest()

    class Stream:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def aiter_bytes(self):
            yield demo_bytes

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        def stream(self, _method, _url):
            return Stream()

    monkeypatch.setattr(app_module.httpx, "AsyncClient", Client)

    stub = tmp_path / "stub"
    stub.mkdir()
    (stub / "parser.py").write_text(
        "def parse_demo_file(_path):\n"
        "    return {'header': {'map': 'de_test'}, 'players': [], 'rounds': [], "
        "'events': [], 'warnings': []}\n"
        "NON_DEMO_FAILURES = (MemoryError, KeyboardInterrupt, SystemExit)\n"
    )
    parser_child_code = (
        "import runpy, sys\n"
        f"sys.path.insert(0, {str(stub)!r})\n"
        "sys.argv = ['parser_child', sys.argv[1], sys.argv[2]]\n"
        "runpy.run_module('parser_child', run_name='__main__')\n"
    )
    monkeypatch.setattr(
        parser_isolated,
        "_command",
        lambda demo, result: [sys.executable, "-c", parser_child_code, demo, str(result)],
    )

    body = app_module.ParseRequest(
        contract_version=1,
        upload_id="22222222-2222-2222-2222-222222222222",
        demo_url="https://storage.example/demo.dem",
        demo_sha256=demo_sha,
        file_size=len(demo_bytes),
    )

    payload = asyncio.run(
        app_module._parse_downloaded(
            body,
            make_settings(),
            parser_isolated.parse_demo_file_isolated,
            finalize_raw=False,
        )
    )

    assert payload["header"]["map"] == "de_test"
    assert _worker_temp_files(tmp_path) == []
