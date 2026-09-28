"""Pinned, disposable CS2 DEM fixture acquisition for R11.2."""
from __future__ import annotations

from datetime import UTC, datetime
import hashlib
from pathlib import Path
import tempfile
import urllib.request

FIXTURE_ID = "R11_DISPOSABLE_DEM_FIXTURE"
SOURCE = "https://github.com/LaihoE/demoparser"
SOURCE_REVISION = "4131a4fc02fda291b22421c20e1ca33f149535a7"
FILENAME = "test_demo.dem"
EXPECTED_BYTES = 60_601_900
EXPECTED_SHA256 = "84a1a4191302bdd2a3bbb5a727842093744b1fb1a228aeec630369e44b622cb2"
SOURCE_URL = (
    "https://raw.githubusercontent.com/LaihoE/demoparser/"
    f"{SOURCE_REVISION}/src/parser/{FILENAME}"
)


def acquire() -> tuple[Path, dict[str, object]]:
    root = Path(tempfile.mkdtemp(prefix="f553-r11-fixture-"))
    destination = root / FILENAME
    downloaded_at = datetime.now(UTC).isoformat()
    digest = hashlib.sha256()
    total = 0
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "GamePro-R11.2-CI"})
    with urllib.request.urlopen(request, timeout=180) as response, destination.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > EXPECTED_BYTES:
                raise RuntimeError("R11_FIXTURE_SIZE_EXCEEDED")
            digest.update(chunk)
            output.write(chunk)
    actual = digest.hexdigest()
    if total != EXPECTED_BYTES or actual != EXPECTED_SHA256:
        destination.unlink(missing_ok=True)
        raise RuntimeError("R11_FIXTURE_INTEGRITY_MISMATCH")
    if destination.read_bytes()[:8] != b"PBDEMS2\x00":
        destination.unlink(missing_ok=True)
        raise RuntimeError("R11_FIXTURE_NOT_CS2")
    verified_at = datetime.now(UTC).isoformat()
    return destination, {
        "fixture_id": FIXTURE_ID,
        "source": SOURCE,
        "source_revision": SOURCE_REVISION,
        "source_url": SOURCE_URL,
        "filename": FILENAME,
        "bytes": total,
        "sha256": actual,
        "license": "MIT",
        "downloaded_at": downloaded_at,
        "verified_at": verified_at,
        "storage_scope": "github_actions_runner_only",
    }