#!/usr/bin/env python3
"""Offline regression tests for strict A9.1 workflow-dispatch metadata validation."""

from __future__ import annotations

import contextlib
import importlib.util
import io
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("a91_execute", ROOT / "scripts/a91/execute.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("A91_TEST_MODULE_LOAD_FAILED")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

SHA = MODULE.SHA
BASE = {
    "A91_DEMO_URL": "https://example.invalid/authorized-demo?sig=not-real",
    "EXPECTED_SHA256": SHA,
    "DEM_SHA256": SHA,
    "EXPECTED_SIZE_BYTES": str(MODULE.SIZE),
    "DEMO_FILENAME": MODULE.FILENAME,
    "AUTHORIZATION_REF": MODULE.AUTH,
}


def call(env):
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        result = MODULE.inputs(env)
    # The signed URL must never be emitted by the metadata validator.
    assert BASE["A91_DEMO_URL"] not in output.getvalue()
    return result, output.getvalue()


def rejected(env, expected_failure="AUTHORIZATION_MISMATCH"):
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            MODULE.inputs(env)
    except ValueError as error:
        assert str(error) == expected_failure, str(error)
        assert BASE["A91_DEMO_URL"] not in output.getvalue()
        return output.getvalue()
    raise AssertionError("invalid A9.1 metadata was accepted")


# Canonical input and copy/paste whitespace/case variations are safe to normalize.
assert call(dict(BASE))[0] == BASE["A91_DEMO_URL"]
padded_upper = dict(BASE, EXPECTED_SHA256=f" \n{SHA.upper()}\t ", DEM_SHA256=f" {SHA.upper()} ")
assert call(padded_upper)[0] == BASE["A91_DEMO_URL"]

# Real digest mismatches, malformed digests, and disagreement between aliases fail closed.
wrong_sha = ("1" if SHA[0] != "1" else "2") + SHA[1:]
bad = dict(BASE, EXPECTED_SHA256=wrong_sha)
assert '"sha256_match":false' in rejected(bad).replace(" ", "")
bad = dict(BASE, EXPECTED_SHA256="not-a-sha256")
assert '"expected_sha_format_valid":false' in rejected(bad).replace(" ", "")
bad = dict(BASE, DEM_SHA256=wrong_sha)
assert '"dem_sha256_match":false' in rejected(bad).replace(" ", "")

print("A9.1 dispatch SHA metadata regression tests PASS")
