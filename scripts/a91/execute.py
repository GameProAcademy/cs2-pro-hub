"""Manual laboratory orchestrator. No network or parsing on import."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import platform
from importlib.metadata import version
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
FILENAME = "furia-vs-gamerlegion-m1-cache.dem"
SIZE = 473748061
SHA = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d"
AUTH = "A9.1-M1-CACHE-REAL-DEM"
ALLOWED = {"a91_real_dem_report.json", "parity_report.json", "determinism_report.json",
           "python_run_1.json", "python_run_2.json", "wasm_run_1.json", "wasm_run_2.json"}
LOCKS = {"canonicalAuthorization": False, "attempt9Authorization": False,
         "productionAuthorization": False, "canonicalEligible": False}


def stable(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(stable(value).encode()).hexdigest()


def inputs(env):
    url = env.get("A91_DEMO_URL", "")
    if not url:
        raise ValueError("A91_DEMO_URL_MISSING")
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or "\n" in url or "\r" in url:
            raise ValueError()
    except ValueError:
        raise ValueError("INVALID_DEM_URL") from None
    if (env.get("DEMO_FILENAME") != FILENAME or env.get("EXPECTED_SHA256") != SHA or
            env.get("EXPECTED_SIZE_BYTES") != str(SIZE) or env.get("AUTHORIZATION_REF") != AUTH):
        raise ValueError("AUTHORIZATION_MISMATCH")
    return url


def validate_download(path, size=SIZE, sha=SHA):
    if not path.is_file():
        raise ValueError("MISSING_DEM")
    if path.suffix.lower() != ".dem":
        raise ValueError("WRONG_DEM_EXTENSION")
    if path.stat().st_size != size:
        raise ValueError("A91_DEM_SIZE_MISMATCH")
    h = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
    if h.hexdigest() != sha:
        raise ValueError("A91_DEM_SHA256_MISMATCH")


def clean(path):
    shutil.rmtree(path)
    if path.exists():
        raise ValueError("CLEANUP_FAILURE")


def run(command, output=None, stdin=None):
    child_env = {k: v for k, v in os.environ.items() if k != "A91_DEMO_URL"}
    try:
        if output:
            with output.open("wb") as target:
                result = subprocess.run(command, input=stdin, env=child_env, cwd=ROOT, stdout=target, stderr=subprocess.DEVNULL, timeout=1800)
        else:
            result = subprocess.run(command, input=stdin, env=child_env, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=1800)
        return result.returncode
    except (subprocess.TimeoutExpired, OSError, MemoryError):
        raise ValueError("A91_RUNTIME_RESOURCE_FAILURE") from None


def download(path, url):
    # Curl reads the URL from stdin, never argv, disk, or child environment.
    escaped = url.replace("\\", "\\\\").replace('"', '\\"')
    return run(["curl", "--config", "-", "--silent", "--fail", "--location", "--retry", "5",
                "--retry-all-errors", "--retry-max-time", "300", "--connect-timeout", "30", "--max-time", "600",
                "--proto", "=https", "--proto-redir", "=https", "--tlsv1.2", "--max-filesize", str(SIZE),
                "--output", str(path)], stdin=('url = "' + escaped + '"\n').encode())


def seal(directory, private_url=""):
    private_host = urlsplit(private_url).hostname if private_url else None
    for path in directory.iterdir():
        if path.name not in ALLOWED or not path.is_file() or path.is_symlink() or path.stat().st_size > 2 * 1024 * 1024:
            raise ValueError("ARTIFACT_SECURITY_FAILURE")
        text = path.read_text()
        value = json.loads(text)
        stable(value)  # Reject NaN/Infinity.
        safe_text = text.replace('"A91_DEMO_URL_MISSING"', '"DEM_URL_MISSING"')
        if (private_url and private_url in text) or (private_host and private_host in text) or re.search(r"https?://|Bearer\s|signed[_-]?url|access[_-]?token|refresh[_-]?token|password|cookie|A91_DEMO_URL|\bAuthorization\b|[?&](?:signature|sig|token|X-Amz-[\w-]+)=", safe_text, re.I):
            raise ValueError("ARTIFACT_SECURITY_FAILURE")


def enrich_python(path):
    value = json.loads(path.read_text())
    if value.get("status") != "SUCCEEDED" or value.get("demoSha256") != SHA or value.get("demoSizeBytes") != SIZE:
        raise ValueError("PYTHON_RUN_FAILED")
    # Additional digests bind actual existing evidence, never fabricated samples.
    for key, source in {"rawDigest": "normalizedResult", "eventDigest": "eventEvidence",
                        "tickDigest": "tickDomainEvidence", "roundDigest": "roundEvidence",
                        "playerDigest": "playerInventory"}.items():
        value[key] = digest(value[source])
    value.update(LOCKS)
    value.update(executionKind="REAL_DEM_FULL_FILE", test_fixture_only=False)
    value["environmentFingerprint"] = {
        "pythonVersion": platform.python_version(), "platform": platform.system(),
        "demoparser2Version": version("demoparser2"),
        "requirementsDigest": hashlib.sha256((ROOT / "services/cs2-demo-parser/requirements.txt").read_bytes()).hexdigest(),
    }
    path.write_text(stable(value))


def main():
    output = Path(os.environ["RUNNER_TEMP"]) / "a91-artifacts"
    output.mkdir(mode=0o700, exist_ok=False)
    temporary = Path(tempfile.mkdtemp(prefix="a91-private-", dir=os.environ["RUNNER_TEMP"]))
    url = ""
    reason = None
    try:
        url = inputs(os.environ)
        if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or os.environ.get("GITHUB_REF") != "refs/heads/main":
            raise ValueError("MANUAL_MAIN_REQUIRED")
        demo = temporary / FILENAME
        rc = download(demo, url)
        if rc:
            raise ValueError("DOWNLOAD_FAILED")
        validate_download(demo)
        if run([sys.executable, str(ROOT / "scripts/a91/validate_structure.py"), str(demo)]):
            raise ValueError("A91_DEM_STRUCTURE_INVALID")
        authorization = {"authorizedDemo": True, "provenance": "LOCAL_FILE", "filename": FILENAME,
                         "sha256": SHA, "sizeBytes": SIZE, "source": "LOCAL_FILE", "authorizationRef": AUTH,
                         "receivedAt": datetime.now(timezone.utc).isoformat()}
        auth_path = temporary / "authorization.json"
        auth_path.write_text(stable(authorization))
        for index in (1, 2):
            target = output / f"python_run_{index}.json"
            if run([sys.executable, str(ROOT / "services/cs2-demo-parser/python_reference.py"), str(demo), stable(authorization)], target):
                raise ValueError("PYTHON_RUN_FAILED")
            enrich_python(target)
        for index in (1, 2):
            if run(["node", "--max-old-space-size=6144", "scripts/a91/run_wasm_reference.mjs",
                    "--demo", str(demo), "--authorization", str(auth_path), "--output", str(output / f"wasm_run_{index}.json")]):
                raise ValueError("WASM_RUN_FAILED")
        # Always evaluate both gates, even if parity fails. Determinism is independent.
        run(["node", "scripts/run_python_wasm_parity.mjs", "--demo", str(demo), "--authorization", str(auth_path),
             "--python-artifact", str(output / "python_run_1.json"), "--wasm-artifact", str(output / "wasm_run_1.json"),
             "--output", str(output / "parity_report.json")])
        run(["node", "scripts/run_parser_determinism.mjs", *[str(output / name) for name in
             ("python_run_1.json", "python_run_2.json", "wasm_run_1.json", "wasm_run_2.json")],
             "--output", str(output / "determinism_report.json")])
        if run(["node", "scripts/a91/finalize_report.mjs", str(output)]):
            reason = "A91_GATE_FAILED"
    except ValueError as error:
        reason = str(error)
    except Exception:
        reason = "A91_RUNTIME_RESOURCE_FAILURE"
    finally:
        try:
            clean(temporary)
        except Exception:
            reason = "CLEANUP_FAILURE"
    if reason and not (output / "a91_real_dem_report.json").exists():
        (output / "a91_real_dem_report.json").write_text(stable({"schema_version": 1, "status": "FAIL", "reason": reason, **LOCKS}))
    if reason == "CLEANUP_FAILURE":
        (output / "a91_real_dem_report.json").write_text(stable({"schema_version": 1, "status": "FAIL", "reason": reason, **LOCKS}))
    try:
        seal(output, url)
    except Exception:
        shutil.rmtree(output)
        print("ARTIFACT_SECURITY_FAILURE", file=sys.stderr)
        return 1
    if reason == "CLEANUP_FAILURE":
        shutil.rmtree(output)
        return 1
    # Upload guard marker is created only after cleanup and content inspection.
    (Path(os.environ["RUNNER_TEMP"]) / "a91-upload-safe").touch()
    print("A9.1 FAIL" if reason else "A9.1 PASS")
    return 1 if reason else 0


if __name__ == "__main__":
    raise SystemExit(main())