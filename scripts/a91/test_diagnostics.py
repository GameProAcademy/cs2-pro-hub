"""Local child-process diagnostics; no parser, network or real DEM execution."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
import execute


class DiagnosticsTests(unittest.TestCase):
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