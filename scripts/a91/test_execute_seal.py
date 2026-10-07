"""Regression tests for the A9.1 sanitized evidence seal."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from scripts.a91.execute import seal


PUBLIC_REPORTS = (
    "a91_real_dem_report.json",
    "parity_report.json",
    "determinism_report.json",
)


def write_report(directory: Path, name: str, payload: dict) -> None:
    (directory / name).write_text(json.dumps(payload), encoding="utf-8")


def write_public_reports(directory: Path, payload: dict | None = None) -> None:
    value = payload or {"status": "PASS", "reference": "https://github.com/example/project"}
    for name in PUBLIC_REPORTS:
        write_report(directory, name, value)


def test_private_runtime_evidence_is_not_part_of_public_seal_boundary() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        write_public_reports(directory)
        write_report(
            directory,
            "python_run_1.json",
            {"status": "SUCCEEDED", "reference": "https://gamepro.gg/furia-vs-gamerlegion-m1-cache.dem"},
        )
        seal(directory, "https://gamepro.gg/furia-vs-gamerlegion-m1-cache.dem")


def test_public_report_cannot_contain_private_dem_url_or_host() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        write_public_reports(
            directory,
            {"status": "PASS", "reference": "https://gamepro.gg/furia-vs-gamerlegion-m1-cache.dem"},
        )
        try:
            seal(directory, "https://gamepro.gg/furia-vs-gamerlegion-m1-cache.dem")
        except ValueError as error:
            assert str(error) == "ARTIFACT_SECURITY_FAILURE"
        else:
            raise AssertionError("private DEM URL must remain blocked in public evidence")


def test_credential_patterns_remain_blocked() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        write_public_reports(
            directory,
            {"status": "PASS", "url": "https://example.com/download?token=redacted"},
        )
        try:
            seal(directory, "")
        except ValueError as error:
            assert str(error) == "ARTIFACT_SECURITY_FAILURE"
        else:
            raise AssertionError("credential-bearing URL must be blocked")


def test_missing_public_report_fails_closed() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        write_public_reports(directory)
        (directory / "parity_report.json").unlink()
        try:
            seal(directory, "")
        except ValueError as error:
            assert str(error) == "ARTIFACT_SECURITY_FAILURE"
        else:
            raise AssertionError("missing public evidence must fail closed")
