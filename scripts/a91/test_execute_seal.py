"""Regression tests for the A9.1 sanitized evidence seal."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from scripts.a91.execute import seal


def write_report(directory: Path, name: str, payload: dict) -> None:
    (directory / name).write_text(json.dumps(payload), encoding="utf-8")


def test_public_url_is_allowed_but_private_dem_url_is_not() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        write_report(
            directory,
            "python_run_1.json",
            {"status": "SUCCEEDED", "reference": "https://github.com/example/project"},
        )
        seal(directory, "https://gamepro.gg/furia-vs-gamerlegion-m1-cache.dem")

        write_report(
            directory,
            "python_run_2.json",
            {"status": "SUCCEEDED", "reference": "https://gamepro.gg/other-public-resource"},
        )
        try:
            seal(directory, "https://gamepro.gg/furia-vs-gamerlegion-m1-cache.dem")
        except ValueError as error:
            assert str(error) == "ARTIFACT_SECURITY_FAILURE"
        else:
            raise AssertionError("private DEM host must remain blocked")


def test_credential_patterns_remain_blocked() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        write_report(
            directory,
            "wasm_run_1.json",
            {"status": "SUCCEEDED", "url": "https://example.com/download?token=redacted"},
        )
        try:
            seal(directory, "")
        except ValueError as error:
            assert str(error) == "ARTIFACT_SECURITY_FAILURE"
        else:
            raise AssertionError("credential-bearing URL must be blocked")
