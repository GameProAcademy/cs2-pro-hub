"""Synthetic mechanics only. No parser calls or network access."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import execute


class HarnessTests(unittest.TestCase):
    def test_missing_and_http_url(self):
        with self.assertRaisesRegex(ValueError, "NO_DEM_URL"):
            execute.inputs({})
        with self.assertRaisesRegex(ValueError, "INVALID_DEM_URL"):
            execute.inputs({"DEMO_URL": "http://example.invalid"})

    def test_authorization_mismatch(self):
        with self.assertRaisesRegex(ValueError, "AUTHORIZATION_MISMATCH"):
            execute.inputs({"DEMO_URL": "https://example.invalid"})

    def test_file_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "synthetic.dem"
            with self.assertRaisesRegex(ValueError, "MISSING_DEM"):
                execute.validate_download(path)
            path.write_bytes(b"synthetic mechanics only; parser never invoked")
            size = path.stat().st_size
            with self.assertRaisesRegex(ValueError, "A91_DEM_SIZE_MISMATCH"):
                execute.validate_download(path, size + 1)
            with self.assertRaisesRegex(ValueError, "A91_DEM_SHA256_MISMATCH"):
                execute.validate_download(path, size, "0" * 64)
            execute.validate_download(path, size, hashlib.sha256(path.read_bytes()).hexdigest())
            wrong = Path(temp) / "not.txt"
            wrong.touch()
            with self.assertRaisesRegex(ValueError, "WRONG_DEM_EXTENSION"):
                execute.validate_download(wrong)

    def test_cleanup_and_failure(self):
        path = Path(tempfile.mkdtemp())
        (path / "synthetic.dem").touch()
        execute.clean(path)
        self.assertFalse(path.exists())
        with patch.object(execute.shutil, "rmtree"), tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "CLEANUP_FAILURE"):
                execute.clean(Path(temp))

    def test_seal_rejects_url_and_dem(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            report = directory / "a91_real_dem_report.json"
            report.write_text(json.dumps({"private": "https://example.invalid/signed"}))
            with self.assertRaisesRegex(ValueError, "ARTIFACT_SECURITY_FAILURE"):
                execute.seal(directory)
            report.write_text(json.dumps({"status": "FAIL", **execute.LOCKS}))
            execute.seal(directory)
            (directory / "synthetic.dem").touch()
            with self.assertRaisesRegex(ValueError, "ARTIFACT_SECURITY_FAILURE"):
                execute.seal(directory)

    def test_missing_url_orchestrator_cleans_and_never_parses(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(execute.os.environ, {"RUNNER_TEMP": temp}, clear=True), patch.object(execute, "run") as run:
            self.assertEqual(execute.main(), 1)
            run.assert_not_called()
            self.assertFalse(list(Path(temp).glob("a91-private-*")))
            report = json.loads((Path(temp) / "a91-artifacts/a91_real_dem_report.json").read_text())
            self.assertEqual(report["status"], "FAIL")
            self.assertFalse(report["productionAuthorization"])


if __name__ == "__main__":
    unittest.main()