"""Local child-process diagnostics; no parser, network or real DEM execution."""
import json
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
import execute


class DiagnosticsTests(unittest.TestCase):
    def test_failed_runtime_projects_only_safe_diagnostics_before_cleanup(self):
        with tempfile.TemporaryDirectory() as raw:
            env = {"RUNNER_TEMP": raw, "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_REF": "refs/heads/main",
                   "A91_DEMO_URL": "https://private.example.invalid/demo", "DEMO_FILENAME": execute.FILENAME,
                   "EXPECTED_SHA256": execute.SHA, "EXPECTED_SIZE_BYTES": str(execute.SIZE), "AUTHORIZATION_REF": execute.AUTH}
            def child(command, output=None, stdin=None, diagnostics=None):
                if "run_wasm_reference.mjs" in " ".join(command):
                    target = Path(command[command.index("--output") + 1])
                    target.write_text(json.dumps({"status": "FAIL", "reason": "WASM_MEMORY_ALLOCATION_FAILURE",
                                                 "stage": "after_parse_events", "failedStage": "parse_grenades",
                                                 "stderr": "PRIVATE RAW CONTENT"}))
                    diagnostics.write_text(json.dumps({"reason": "WASM_MEMORY_ALLOCATION_FAILURE", "errorDigest": "a" * 64}))
                    return 1
                if output:
                    output.write_text("{}")
                return 0
            with patch.dict(execute.os.environ, env, clear=True), patch.object(execute, "download", return_value=0), patch.object(execute, "validate_download"), patch.object(execute, "enrich_python"), patch.object(execute, "run", side_effect=child):
                self.assertEqual(execute.main(), 1)
            report = json.loads((Path(raw) / "a91-artifacts/a91_real_dem_report.json").read_text())
            self.assertEqual(report["reason"], "WASM_MEMORY_ALLOCATION_FAILURE")
            self.assertEqual(report["stage"], "parse_grenades")
            self.assertEqual(report["errorDigest"], "a" * 64)
            self.assertNotIn("PRIVATE RAW CONTENT", json.dumps(report))
            self.assertFalse(list(Path(raw).glob("a91-private-*")))
            self.assertEqual({p.name for p in (Path(raw) / "a91-artifacts").iterdir()}, execute.ALLOWED)

    def test_private_stderr_is_bounded_hashed_and_not_public(self):
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            private = base / "private"
            private.mkdir(mode=0o700)
            path = private / "child.json"
            rc = execute.run([sys.executable, "-c", "import sys; sys.stderr.write('private diagnostic'); sys.exit(1)"], diagnostics=path)
            self.assertEqual(rc, 1)
            diagnostic = json.loads(path.read_text())
            self.assertRegex(diagnostic["errorDigest"], r"^[a-f0-9]{64}$")
            self.assertNotIn("private diagnostic", path.read_text())
            self.assertEqual(path.with_suffix(".stderr").read_text(), "private diagnostic")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            execute.clean(private)
            self.assertFalse(private.exists())

    def test_child_classification(self):
        self.assertEqual(execute.classify_child_failure(-9, b"", True), "WASM_RUNTIME_RESOURCE_FAILURE")
        self.assertEqual(execute.classify_child_failure(1, b"RangeError: memory allocation failure", True), "WASM_MEMORY_ALLOCATION_FAILURE")
        self.assertEqual(execute.classify_child_failure(1, b"RuntimeError: unreachable", True), "WASM_RUNTIME_TRAP")
        self.assertEqual(execute.classify_child_failure(1, b"unknown", True), "A91_RUNTIME_RESOURCE_FAILURE")

    def test_python_private_envelope_security_and_limit(self):
        value = {"value": "x" * (9 * 1024 * 1024)}
        self.assertGreater(len(execute.sanitize_private_runtime_evidence(value)), execute.MAX_REPORT_BYTES)
        for value in ({"Authorization": "private"}, {"value": "Bearer private-token-value"}):
            with self.assertRaisesRegex(ValueError, "ARTIFACT_SECURITY_FAILURE"):
                execute.sanitize_private_runtime_evidence(value)