#!/usr/bin/env python3
"""Automatic PUBLIC-FIXTURE regression gate for the A9.1 harness.

Runs the same pinned WASM build, the same Python reference and the same
comparator as the manual real-DEM gate, but on the public upstream test demo.
It never touches the real demo, its URL or its secrets, and its artifacts are
test_fixture_only: decide() rejects them, so this job cannot authorize A9.1.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
PUBLIC_FIXTURE = {
    "filename": "test_demo.dem",
    "sizeBytes": 60601900,
    "sha256": "84a1a4191302bdd2a3bbb5a727842093744b1fb1a228aeec630369e44b622cb2",
    "authorizationRef": "A9.1-PUBLIC-FIXTURE-DEMOPARSER-TEST-DEMO",
    "sourceCommit": "4131a4fc02fda291b22421c20e1ca33f149535a7",
    "sourcePath": "src/parser/test_demo.dem",
}
FIXTURE_URL = (
    "https://raw.githubusercontent.com/LaihoE/demoparser/"
    f"{PUBLIC_FIXTURE['sourceCommit']}/{PUBLIC_FIXTURE['sourcePath']}"
)
# Real-demo inputs must never reach this job, even if a caller exports them.
FORBIDDEN_ENV = ("A91_DEMO_URL", "EXPECTED_SHA256", "DEM_SHA256", "AUTHORIZATION_REF", "DEM_AUTH")
PUBLIC_OUTPUTS = ("a91_public_fixture_report.json", "parity_report.json", "determinism_report.json")


def stable(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(label: str, *command: str, stdout: pathlib.Path | None = None, env: dict[str, str]) -> float:
    started = time.monotonic()
    print(f"A91_PUBLIC_FIXTURE_STEP {label}", flush=True)
    if stdout is None:
        subprocess.run(command, cwd=ROOT, env=env, check=True)
    else:
        with stdout.open("wb") as target:
            subprocess.run(command, cwd=ROOT, env=env, check=True, stdout=target)
    return time.monotonic() - started


def main() -> int:
    if any(os.environ.get(key) for key in FORBIDDEN_ENV):
        raise SystemExit("A91_PUBLIC_FIXTURE_GATE_REFUSES_REAL_DEM_INPUTS")
    env = {key: value for key, value in os.environ.items() if key not in FORBIDDEN_ENV}
    temp = pathlib.Path(os.environ.get("RUNNER_TEMP", "/tmp"))
    work = temp / "a91-public-fixture-work"
    output = temp / "a91-public-fixture-artifacts"
    for directory in (work, output):
        shutil.rmtree(directory, ignore_errors=True)
        directory.mkdir(parents=True)

    demo = work / PUBLIC_FIXTURE["filename"]
    local = os.environ.get("A91_PUBLIC_FIXTURE_PATH", "").strip()
    if local:
        shutil.copyfile(local, demo)
    else:
        subprocess.run(
            ["curl", "--silent", "--show-error", "--fail", "--location", "--retry", "5",
             "--proto", "=https", "--tlsv1.2", "--max-filesize", str(PUBLIC_FIXTURE["sizeBytes"]),
             "--output", str(demo), FIXTURE_URL],
            cwd=ROOT, env=env, check=True,
        )
    if demo.stat().st_size != PUBLIC_FIXTURE["sizeBytes"] or sha256(demo) != PUBLIC_FIXTURE["sha256"]:
        raise SystemExit("A91_PUBLIC_FIXTURE_IDENTITY_MISMATCH")

    wasm_dir = os.environ.get("A91_WASM_ARTIFACT_DIR", "").strip()
    wasm_manifest = os.environ.get("A91_WASM_MANIFEST", "").strip()
    if not wasm_dir or not wasm_manifest:
        raise SystemExit("WASM_ARTIFACT_IDENTITY_MISMATCH")
    if os.environ.get("A91_PUBLIC_FIXTURE_PREBUILT_WASM") != "1":
        # Same preflight and same build function as the manual real-DEM gate.
        os.environ.setdefault("GITHUB_WORKSPACE", str(ROOT))
        sys.path.insert(0, str(ROOT / "scripts/a91"))
        import rebuild_wasm_large_demo as rebuild

        rebuild.preflight()
        rebuild.build_wasm_artifact()

    authorization = {
        "authorizedDemo": True,
        "provenance": "LOCAL_FILE",
        "source": "LOCAL_FILE",
        "filename": PUBLIC_FIXTURE["filename"],
        "sha256": PUBLIC_FIXTURE["sha256"],
        "sizeBytes": PUBLIC_FIXTURE["sizeBytes"],
        "authorizationRef": PUBLIC_FIXTURE["authorizationRef"],
        "receivedAt": datetime.now(timezone.utc).isoformat(),
    }
    auth_path = work / "authorization.json"
    auth_path.write_text(stable(authorization))

    timings: dict[str, float] = {}
    for index in (1, 2):
        target = work / f"python_run_{index}.json"
        timings[f"python_run_{index}"] = run(
            f"python_run_{index}", sys.executable, "services/cs2-demo-parser/python_reference.py", str(demo), stable(authorization),
            stdout=target, env=env,
        )
        run(f"python_digest_{index}", "node", "--max-old-space-size=4096", "scripts/a91/normalize_python_digest.mjs", str(target), env=env)
    for index in (1, 2):
        timings[f"wasm_run_{index}"] = run(
            f"wasm_run_{index}", "node", "--expose-gc", "--max-old-space-size=4096", "scripts/a91/run_wasm_reference.mjs",
            "--demo", str(demo), "--authorization", str(auth_path),
            "--output", str(work / f"wasm_run_{index}.json"),
            "--wasm-dir", wasm_dir, "--wasm-manifest", wasm_manifest,
            env=env,
        )

    # Parity and determinism report their own FAIL/PASS; a non-zero exit here is
    # an expected outcome that the ratchet evaluates, not an execution error.
    for name, command in (
        ("parity_report.json", [
            "node", "scripts/run_python_wasm_parity.mjs", "--demo", str(demo), "--authorization", str(auth_path),
            "--python-artifact", str(work / "python_run_1.json"), "--wasm-artifact", str(work / "wasm_run_1.json"),
            "--output", str(work / "parity_report.json"),
        ]),
        ("determinism_report.json", [
            "node", "scripts/run_parser_determinism.mjs",
            *[str(work / item) for item in ("python_run_1.json", "python_run_2.json", "wasm_run_1.json", "wasm_run_2.json")],
            "--output", str(work / "determinism_report.json"),
        ]),
    ):
        subprocess.run(command, cwd=ROOT, env=env, check=False, stdout=subprocess.DEVNULL)
        if not (work / name).is_file():
            raise SystemExit(f"A91_PUBLIC_FIXTURE_REPORT_MISSING:{name}")

    print("A91_PUBLIC_FIXTURE_STEP evaluate", flush=True)
    verdict = subprocess.run(
        ["node", "--expose-gc", "--max-old-space-size=6144", "scripts/a91/public_fixture_report.mjs",
         "--work", str(work), "--demo", str(demo), "--wasm-dir", wasm_dir, "--wasm-manifest", wasm_manifest,
         "--expectations", "scripts/a91/public_fixture_expectations.json",
         "--output", str(work / "a91_public_fixture_report.json")],
        cwd=ROOT, env=env, check=False,
    ).returncode
    report_path = work / "a91_public_fixture_report.json"
    if not report_path.is_file():
        raise SystemExit("A91_PUBLIC_FIXTURE_REPORT_MISSING:a91_public_fixture_report.json")
    report = json.loads(report_path.read_text())
    report["wallClockSeconds"] = {key: round(value, 1) for key, value in timings.items()}
    report_path.write_text(stable(report))
    # Only the bounded reports leave the work directory; per-runtime evidence
    # (which holds bounded row samples of the public demo) is deleted.
    for name in PUBLIC_OUTPUTS:
        shutil.copyfile(work / name, output / name)
    shutil.rmtree(work, ignore_errors=True)
    print(f"A91_PUBLIC_FIXTURE_ARTIFACTS={output}", flush=True)
    return 0 if verdict == 0 and report.get("status") == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
