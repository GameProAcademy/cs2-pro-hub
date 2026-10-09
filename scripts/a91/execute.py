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
import threading
from importlib.metadata import version
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
FILENAME = "furia-vs-gamerlegion-m1-cache.dem"
SIZE = 473748061
SHA = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d"
AUTH = "A9.1-M1-CACHE-REAL-DEM"
ALLOWED = {"a91_real_dem_report.json", "parity_report.json", "determinism_report.json"}
MAX_REPORT_BYTES = 8 * 1024 * 1024
MAX_PRIVATE_RUNTIME_EVIDENCE_BYTES = 256 * 1024 * 1024
MAX_PRIVATE_STDERR_BYTES = 1024 * 1024
WASM_REASONS = {"WASM_RUNTIME_RESOURCE_FAILURE", "WASM_MEMORY_ALLOCATION_FAILURE",
    "WASM_RUNTIME_TRAP", "WASM_PARSE_FAILURE", "WASM_PRIVATE_EVIDENCE_TOO_LARGE",
    "A91_DEMO_FRAME_SCAN_INVALID", "A91_TICK_PROBE_RANGE_MISSING", "A91_TICK_PROBE_EMPTY",
    "WASM_ARTIFACT_IDENTITY_MISMATCH", "UNSUPPORTED_WASM_API", "CATALOG_MISMATCH",
    "CONTRACT_MISMATCH", "PARSER_IDENTITY_MISMATCH", "ARTIFACT_SECURITY_FAILURE"}
PYTHON_REASONS = {
    "NO_AUTHORIZED_REAL_DEM", "EXPLICIT_AUTHORIZED_DEM_PATH_REQUIRED",
    "AUTHORIZED_DEM_METADATA_MISMATCH", "A91_DEM_SHA256_MISMATCH",
    "PARSER_IDENTITY_MISMATCH", "CATALOG_MISMATCH", "CONTRACT_MISMATCH",
    "A91_DEMO_FRAME_SCAN_INVALID", "A91_TICK_PROBE_RANGE_MISSING", "A91_TICK_PROBE_EMPTY",
}
LOCKS = {"canonicalAuthorization": False, "attempt9Authorization": False,
         "productionAuthorization": False, "canonicalEligible": False}


def stable(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(stable(value).encode()).hexdigest()


def inputs(env):
    url = env.get("A91_DEMO_URL", "")
    print("A91_DEMO_URL_PRESENT=" + ("true" if url else "false"))
    if not url:
        raise ValueError("A91_DEMO_URL_MISSING")
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or "\n" in url or "\r" in url:
            raise ValueError()
    except ValueError:
        raise ValueError("INVALID_DEM_URL") from None
    # Inputs copied from the workflow-dispatch form can carry leading/trailing
    # whitespace or uppercase hex. Canonicalize only the representation; never
    # relax the authorized digest or the later hash of the downloaded DEM bytes.
    expected_sha_raw = env.get("EXPECTED_SHA256", "")
    expected_sha = expected_sha_raw.strip().lower()
    dem_sha_raw = env.get("DEM_SHA256", "")
    dem_sha = dem_sha_raw.strip().lower()
    expected_sha_format_valid = bool(re.fullmatch(r"[0-9a-f]{64}", expected_sha))
    dem_sha_format_valid = bool(re.fullmatch(r"[0-9a-f]{64}", dem_sha))

    # Emit only boolean metadata checks: never print the signed URL, its host,
    # query string, or any credential-bearing component.
    checks = {
        "filename_match": env.get("DEMO_FILENAME") == FILENAME,
        "expected_sha_format_valid": expected_sha_format_valid,
        "dem_sha_format_valid": dem_sha_format_valid,
        "sha256_match": expected_sha_format_valid and expected_sha == SHA,
        "dem_sha256_match": dem_sha_format_valid and dem_sha == SHA,
        "size_match": env.get("EXPECTED_SIZE_BYTES", "").strip() == str(SIZE),
        "authorization_ref_match": env.get("AUTHORIZATION_REF") == AUTH,
    }
    print("A91_INPUT_CHECKS=" + stable(checks), flush=True)
    if not all(checks.values()):
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


def classify_child_failure(returncode, stderr, wasm=False):
    # A signal/timeout establishes resource failure; text only refines a known failed child.
    if returncode == 0:
        return None
    text = stderr.decode("utf-8", errors="replace")
    if wasm and re.search(r"out of memory|allocation fail|memory (?:grow|allocation)|cannot allocate", text, re.I):
        return "WASM_MEMORY_ALLOCATION_FAILURE"
    if returncode < 0:
        return "WASM_RUNTIME_RESOURCE_FAILURE" if wasm else "A91_RUNTIME_RESOURCE_FAILURE"
    if wasm and re.search(r"RuntimeError|wasm trap", text, re.I):
        return "WASM_RUNTIME_TRAP"
    if wasm and "RangeError" in text:
        return "WASM_RUNTIME_RESOURCE_FAILURE"
    normalized = text.strip()
    if normalized in WASM_REASONS:
        return normalized
    if not wasm:
        lines = [line.strip() for line in normalized.splitlines() if line.strip()]
        if lines:
            last_line = lines[-1]
            for prefix in ("RuntimeError:", "ValueError:", "Exception:"):
                if last_line.startswith(prefix):
                    candidate = last_line[len(prefix):].strip()
                    if candidate in PYTHON_REASONS:
                        return candidate
            if last_line in PYTHON_REASONS:
                return last_line
    return "A91_RUNTIME_RESOURCE_FAILURE"


def run(command, output=None, stdin=None, diagnostics=None):
    child_env = {k: v for k, v in os.environ.items() if k != "A91_DEMO_URL"}
    if diagnostics is not None and "python_reference.py" in " ".join(command):
        child_env["A91_PROGRESS_PATH"] = str(diagnostics.with_suffix(".progress"))
    if diagnostics is None:
        try:
            if output:
                with output.open("wb") as target:
                    return subprocess.run(command, input=stdin, env=child_env, cwd=ROOT, stdout=target,
                                          stderr=subprocess.DEVNULL, timeout=1800).returncode
            return subprocess.run(command, input=stdin, env=child_env, cwd=ROOT, stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL, timeout=1800).returncode
        except (subprocess.TimeoutExpired, OSError, MemoryError):
            raise ValueError("A91_RUNTIME_RESOURCE_FAILURE") from None
    # Drain stderr continuously; retain at most 1 MiB and hash the whole stream.
    # Never print it, put it in a report, or permit an unbounded PIPE buffer.
    h = hashlib.sha256()
    retained = bytearray()
    read_failed = []
    stderr_path = diagnostics.with_suffix(".stderr")
    def drain(stream):
        try:
            with stderr_path.open("wb") as target:
                os.chmod(stderr_path, 0o600)
                for chunk in iter(lambda: stream.read(65536), b""):
                    h.update(chunk)
                    bounded = chunk[:max(0, MAX_PRIVATE_STDERR_BYTES - len(retained))]
                    target.write(bounded)
                    retained.extend(bounded)
        except Exception:
            read_failed.append(True)
    target = output.open("wb") if output else open(os.devnull, "wb")
    try:
        if output:
            os.chmod(output, 0o600)
        with subprocess.Popen(command, env=child_env, cwd=ROOT, stdout=target,
                              stdin=subprocess.PIPE if stdin else subprocess.DEVNULL,
                              stderr=subprocess.PIPE) as child:
            thread = threading.Thread(target=drain, args=(child.stderr,))
            thread.start()
            try:
                if stdin and child.stdin:
                    child.stdin.write(stdin)
                    child.stdin.close()
                rc = child.wait(timeout=1800)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
                rc = -9
            finally:
                thread.join()
    except (OSError, MemoryError):
        rc = -1
    finally:
        target.close()
    if read_failed:
        rc = -1
    command_text = " ".join(command)
    is_wasm_child = "run_wasm_reference.mjs" in command_text or "wasm_smoke.mjs" in command_text
    progress_path = diagnostics.with_suffix(".progress")
    last_stage = None
    if progress_path.is_file():
        try:
            value = progress_path.read_text(encoding="utf-8").strip().splitlines()
            last_stage = value[-1] if value else None
        except Exception:
            last_stage = None
    diagnostic = {"exitStatus": rc, "signal": -rc if rc < 0 else None,
                  "errorDigest": h.hexdigest(), "reason": classify_child_failure(rc, bytes(retained), is_wasm_child)}
    if last_stage:
        diagnostic["lastStage"] = last_stage
    diagnostics.write_text(stable(diagnostic))
    os.chmod(diagnostics, 0o600)
    return rc


def download(path, url):
    # Curl reads the URL from stdin, never argv, disk, or child environment.
    escaped = url.replace("\\", "\\\\").replace('"', '\\"')
    return run(["curl", "--config", "-", "--silent", "--fail", "--location", "--retry", "5",
                "--retry-all-errors", "--retry-max-time", "300", "--connect-timeout", "30", "--max-time", "600",
                "--proto", "=https", "--proto-redir", "=https", "--tlsv1.2", "--max-filesize", str(SIZE),
                "--output", str(path)], stdin=('url = "' + escaped + '"\n').encode())


def _assert_safe_evidence_values(value, private_url="", private_host=None):
    if isinstance(value, str):
        if re.search(r"Bearer\s+[A-Za-z0-9._~+/=-]{8,}", value, re.I):
            raise ValueError("ARTIFACT_SECURITY_FAILURE")
        if value.strip() == "A91_DEMO_URL":
            raise ValueError("ARTIFACT_SECURITY_FAILURE")
        if private_url and private_url in value:
            raise ValueError("ARTIFACT_SECURITY_FAILURE")
        if re.search(r"\b(?:password|cookie)\s*[:=]", value, re.I):
            raise ValueError("ARTIFACT_SECURITY_FAILURE")
        if re.search(r"(?:^|[?&])(?:signature|sig|token|access_token|refresh_token|X-Amz-[\w-]+)=", value, re.I):
            raise ValueError("ARTIFACT_SECURITY_FAILURE")
        if re.search(r"\bAuthorization\s*:", value, re.I):
            raise ValueError("ARTIFACT_SECURITY_FAILURE")
        if "://" in value:
            try:
                parsed = urlsplit(value)
                if parsed.scheme in {"http", "https"}:
                    if parsed.username or parsed.password:
                        raise ValueError("ARTIFACT_SECURITY_FAILURE")
                    if private_url and value == private_url:
                        raise ValueError("ARTIFACT_SECURITY_FAILURE")
                    if private_host and parsed.hostname == private_host:
                        raise ValueError("ARTIFACT_SECURITY_FAILURE")
                    for key in parsed.query.split("&"):
                        name = key.split("=", 1)[0]
                        if re.fullmatch(r"(?:signature|sig|token|access_token|refresh_token|X-Amz-[\w-]+)", name, re.I):
                            raise ValueError("ARTIFACT_SECURITY_FAILURE")
            except ValueError as error:
                if str(error) == "ARTIFACT_SECURITY_FAILURE":
                    raise
                raise ValueError("ARTIFACT_SECURITY_FAILURE") from None
        return
    if isinstance(value, list):
        for item in value:
            _assert_safe_evidence_values(item, private_url, private_host)
    elif isinstance(value, dict):
        # Metadata keys such as "authorizationRef" are not secret values.
        # Scan values recursively to avoid false positives on harmless keys.
        for key, item in value.items():
            if re.fullmatch(r"(?:password|cookies?|access_token|refresh_token|signature|sig|X-Amz-[\w-]+|A91_DEMO_URL)", key, re.I):
                raise ValueError("ARTIFACT_SECURITY_FAILURE")
            if key.lower() == "authorization" and not (key == "authorization" and isinstance(item, dict)):
                raise ValueError("ARTIFACT_SECURITY_FAILURE")
            _assert_safe_evidence_values(item, private_url, private_host)


def seal(directory, private_url=""):
    private_host = urlsplit(private_url).hostname if private_url else None
    # The working directory also contains private per-runtime evidence
    # (python_run_*.json / wasm_run_*.json). Those files are intentionally
    # never uploadable. Seal only the explicit public artifact allowlist;
    # the workflow upload step independently enumerates these same three
    # files. This prevents private raw evidence from becoming a false
    # security failure while preserving the public artifact boundary.
    for name in sorted(ALLOWED):
        path = directory / name
        if not path.is_file() or path.is_symlink():
            raise ValueError("ARTIFACT_SECURITY_FAILURE")
        if path.stat().st_size > MAX_REPORT_BYTES:
            raise ValueError("ARTIFACT_SECURITY_FAILURE")
        try:
            value = json.loads(path.read_text())
            stable(value)  # Reject NaN/Infinity.
            _assert_safe_evidence_values(value, private_url, private_host)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
            raise ValueError("ARTIFACT_SECURITY_FAILURE") from None
def sanitize_private_runtime_evidence(value, private_url=""):
    text = stable(value)
    _assert_safe_evidence_values(value, private_url, urlsplit(private_url).hostname if private_url else None)
    if len(text.encode()) > MAX_PRIVATE_RUNTIME_EVIDENCE_BYTES:
        raise ValueError("PYTHON_PRIVATE_EVIDENCE_TOO_LARGE")
    return text


def enrich_python(path, private_url=""):
    if path.stat().st_size > MAX_PRIVATE_RUNTIME_EVIDENCE_BYTES:
        raise ValueError("PYTHON_PRIVATE_EVIDENCE_TOO_LARGE")
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
    path.write_text(sanitize_private_runtime_evidence(value, private_url))
    os.chmod(path, 0o600)


def main():
    output = Path(os.environ["RUNNER_TEMP"]) / "a91-artifacts"
    output.mkdir(mode=0o700, exist_ok=False)
    temporary = Path(tempfile.mkdtemp(prefix="a91-private-", dir=os.environ["RUNNER_TEMP"]))
    url = ""
    reason = None
    failure_metadata = {}
    stage = "inputs"
    failed_target = None
    failed_diagnostics = None
    try:
        url = inputs(os.environ)
        if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or os.environ.get("GITHUB_REF") != "refs/heads/main":
            raise ValueError("MANUAL_MAIN_REQUIRED")
        demo = temporary / FILENAME
        stage = "download"
        rc = download(demo, url)
        if rc:
            raise ValueError("DOWNLOAD_FAILED")
        stage = "validate_demo"
        validate_download(demo)
        stage = "structure_validation"
        if run([sys.executable, str(ROOT / "scripts/a91/validate_structure.py"), str(demo)]):
            raise ValueError("A91_DEM_STRUCTURE_INVALID")
        authorization = {"authorizedDemo": True, "provenance": "LOCAL_FILE", "filename": FILENAME,
                         "sha256": SHA, "sizeBytes": SIZE, "source": "LOCAL_FILE", "authorizationRef": AUTH,
                         "receivedAt": datetime.now(timezone.utc).isoformat()}
        auth_path = temporary / "authorization.json"
        auth_path.write_text(stable(authorization))
        os.chmod(auth_path, 0o600)

        stage = "wasm_smoke"
        wasm_smoke_diagnostics = temporary / "wasm_smoke_diagnostics.json"
        wasm_dir = os.environ.get("A91_WASM_ARTIFACT_DIR", "").strip()
        wasm_manifest = os.environ.get("A91_WASM_MANIFEST", "").strip()
        if not wasm_dir or not wasm_manifest:
            raise ValueError("WASM_ARTIFACT_IDENTITY_MISMATCH")
        smoke_rc = run([
            "node", "--max-old-space-size=1024", "scripts/a91/wasm_smoke.mjs",
            "--wasm-dir", wasm_dir, "--wasm-manifest", wasm_manifest,
        ], diagnostics=wasm_smoke_diagnostics)
        if smoke_rc:
            failed_diagnostics = wasm_smoke_diagnostics
            raise ValueError("WASM_RUN_FAILED")

        for index in (1, 2):
            stage = f"python_run_{index}"
            target = temporary / f"python_run_{index}.json"
            failed_target = target
            failed_diagnostics = temporary / f"python_run_{index}_diagnostics.json"
            if run([sys.executable, str(ROOT / "services/cs2-demo-parser/python_reference.py"), str(demo), stable(authorization)], target, diagnostics=failed_diagnostics):
                raise ValueError("PYTHON_RUN_FAILED")
            enrich_python(target, url)
        for index in (1, 2):
            stage = f"wasm_run_{index}"
            failed_target = temporary / f"wasm_run_{index}.json"
            failed_diagnostics = temporary / f"wasm_run_{index}_diagnostics.json"
            wasm_command = [
                "node", "--max-old-space-size=6144", "scripts/a91/run_wasm_reference.mjs",
                "--demo", str(demo), "--authorization", str(auth_path), "--output", str(failed_target),
            ]
            wasm_dir = os.environ.get("A91_WASM_ARTIFACT_DIR", "").strip()
            wasm_manifest = os.environ.get("A91_WASM_MANIFEST", "").strip()
            if wasm_dir:
                wasm_command.extend(["--wasm-dir", wasm_dir])
            if wasm_manifest:
                wasm_command.extend(["--wasm-manifest", wasm_manifest])
            if run(wasm_command, diagnostics=failed_diagnostics):
                raise ValueError("WASM_RUN_FAILED")
            if failed_target.stat().st_size > MAX_PRIVATE_RUNTIME_EVIDENCE_BYTES:
                raise ValueError("WASM_PRIVATE_EVIDENCE_TOO_LARGE")
            evidence = json.loads(failed_target.read_text())
            _assert_safe_evidence_values(evidence, url, urlsplit(url).hostname)
        stage = "parity"
        failed_target = None
        failed_diagnostics = temporary / "parity_diagnostics.json"
        # Always evaluate both gates, even if parity fails. Determinism is independent.
        parity_rc = run(["node", "scripts/run_python_wasm_parity.mjs", "--demo", str(demo), "--authorization", str(auth_path),
             "--python-artifact", str(temporary / "python_run_1.json"), "--wasm-artifact", str(temporary / "wasm_run_1.json"),
              "--output", str(output / "parity_report.json")], diagnostics=failed_diagnostics)
        if parity_rc and not (output / "parity_report.json").is_file() and reason is None:
            reason = "PARITY_EXECUTION_FAILED"
        stage = "determinism"
        failed_diagnostics = temporary / "determinism_diagnostics.json"
        determinism_rc = run(["node", "scripts/run_parser_determinism.mjs", *[str(temporary / name) for name in
             ("python_run_1.json", "python_run_2.json", "wasm_run_1.json", "wasm_run_2.json")],
              "--output", str(output / "determinism_report.json")], diagnostics=failed_diagnostics)
        if determinism_rc and not (output / "determinism_report.json").is_file() and reason is None:
            reason = "DETERMINISM_EXECUTION_FAILED"
        stage = "finalization"
        failed_diagnostics = temporary / "finalize_diagnostics.json"
        final_rc = run(["node", "scripts/a91/finalize_report.mjs", str(temporary), str(output)], diagnostics=failed_diagnostics)
        if final_rc:
            # Prefer the normalized decision produced by finalize_report over the
            # generic child-exit code, so parity/determinism failures remain
            # diagnosable in the bounded public report.
            try:
                final_report = json.loads((output / "a91_real_dem_report.json").read_text())
                normalized_reason = final_report.get("reason")
                reason = normalized_reason if isinstance(normalized_reason, str) and normalized_reason else "A91_GATE_FAILED"
            except Exception:
                reason = reason or "A91_GATE_FAILED"
    except ValueError as error:
        reason = str(error)
        # Safe, bounded stage/reason diagnostics make early preflight failures
        # actionable while ensuring no URL, secret, or raw exception is logged.
        print(f"A91_STAGE_FAILURE stage={stage} reason={reason}", flush=True)
    except Exception as error:
        reason = "A91_RUNTIME_RESOURCE_FAILURE"
        print(f"A91_STAGE_FAILURE stage={stage} reason={reason} error_type={type(error).__name__}", flush=True)
    finally:
        # Project only allowlisted normalized fields BEFORE deleting all private evidence.
        if reason:
            failure_metadata = {"stage": stage}
            if failed_diagnostics and failed_diagnostics.is_file():
                try:
                    diagnostic = json.loads(failed_diagnostics.read_text())
                    failure_metadata["errorDigest"] = diagnostic["errorDigest"]
                    if diagnostic.get("lastStage"):
                        failure_metadata["lastChildStage"] = diagnostic["lastStage"]
                    if diagnostic.get("exitStatus") is not None:
                        failure_metadata["childExitStatus"] = diagnostic["exitStatus"]
                    if diagnostic.get("signal") is not None:
                        failure_metadata["childSignal"] = diagnostic["signal"]
                    if reason in {"WASM_RUN_FAILED", "PYTHON_RUN_FAILED"} and diagnostic.get("reason") in WASM_REASONS | PYTHON_REASONS | {"A91_RUNTIME_RESOURCE_FAILURE"}:
                        reason = diagnostic["reason"]
                except Exception:
                    pass
            if failed_target and failed_target.is_file() and failed_target.stat().st_size <= MAX_PRIVATE_RUNTIME_EVIDENCE_BYTES:
                try:
                    failure = json.loads(failed_target.read_text())
                    if failure.get("reason") in WASM_REASONS:
                        reason = failure["reason"]
                    known_stages = {"validate", "structure_validation", "wasm_smoke", "wasm_load", "parse_header", "list_game_events", "list_updated_fields", "parse_events", "parse_grenades", "parse_ticks", "normalization", "private_sanitize", "frame_tick_probe", "parse_ticks_validation"}
                    if failure.get("failedStage") in known_stages:
                        failure_metadata["stage"] = failure["failedStage"]
                    for key in (
                        "trapDetail",
                        "errorName",
                        "errorMessageDigest",
                        "wasmMemoryBytesBefore",
                        "wasmMemoryBytesAfter",
                    ):
                        value = failure.get(key)
                        if value is not None:
                            failure_metadata[key] = value
                except Exception:
                    pass
        try:
            clean(temporary)
        except Exception:
            reason = "CLEANUP_FAILURE"

    # Never let the artifact-seal layer mask the actual gate failure. If a
    # stage stops before parity/determinism/finalization can produce all
    # reports, create bounded public NOT_RUN reports containing only a
    # whitelist of safe stage reasons. Private runtime evidence remains
    # non-uploadable.
    allowed_failure_reasons = {
        "A91_DEM_SIZE_MISMATCH", "A91_DEM_SHA256_MISMATCH",
        "A91_DEM_STRUCTURE_INVALID", "DOWNLOAD_FAILED", "MISSING_DEM",
        "WRONG_DEM_EXTENSION", "AUTHORIZATION_MISMATCH", "INVALID_DEM_URL",
        "A91_DEMO_URL_MISSING", "MANUAL_MAIN_REQUIRED", "PYTHON_RUN_FAILED",
        "WASM_RUN_FAILED", "WASM_ARTIFACT_IDENTITY_MISMATCH",
        "UNSUPPORTED_WASM_API", "CATALOG_MISMATCH", "CONTRACT_MISMATCH",
        "NO_AUTHORIZED_REAL_DEM", "EXPLICIT_AUTHORIZED_DEM_PATH_REQUIRED",
        "AUTHORIZED_DEM_METADATA_MISMATCH", "A91_DEM_SHA256_MISMATCH",
        "PARSER_IDENTITY_MISMATCH",
        "A91_RUNTIME_RESOURCE_FAILURE", "CLEANUP_FAILURE", "A91_GATE_FAILED", "PARITY_EXECUTION_FAILED", "DETERMINISM_EXECUTION_FAILED",
    }
    allowed_failure_reasons |= WASM_REASONS | PYTHON_REASONS | {"PYTHON_PRIVATE_EVIDENCE_TOO_LARGE"}
    if reason:
        public_reason = reason if reason in allowed_failure_reasons else "A91_RUNTIME_RESOURCE_FAILURE"
        public = {
            "schema_version": 1,
            "status": "FAIL",
            "reason": public_reason,
            **failure_metadata,
            **LOCKS,
        }
        report_path = output / "a91_real_dem_report.json"
        if not report_path.exists() or reason != "A91_GATE_FAILED":
            report_path.write_text(stable(public))
        for name, stage in (
            ("parity_report.json", "PARITY_NOT_REACHED"),
            ("determinism_report.json", "DETERMINISM_NOT_REACHED"),
        ):
            path = output / name
            if not path.exists():
                path.write_text(stable({
                    "schema_version": 1,
                    "status": "NOT_RUN",
                    "reason": public_reason,
                    "stage": stage,
                }))
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