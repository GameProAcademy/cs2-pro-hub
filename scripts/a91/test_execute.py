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
        with self.assertRaisesRegex(ValueError, "A91_DEMO_URL_MISSING"):
            execute.inputs({})
        with self.assertRaisesRegex(ValueError, "INVALID_DEM_URL"):
            execute.inputs({"A91_DEMO_URL": "http://example.invalid"})

    def test_authorization_mismatch(self):
        with self.assertRaisesRegex(ValueError, "AUTHORIZATION_MISMATCH"):
            execute.inputs({"A91_DEMO_URL": "https://example.invalid"})

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

    def environment(self, url):
        return {"A91_DEMO_URL": url, "DEMO_FILENAME": execute.FILENAME, "EXPECTED_SHA256": execute.SHA,
                "EXPECTED_SIZE_BYTES": str(execute.SIZE), "AUTHORIZATION_REF": execute.AUTH}

    def test_https_and_credential_rejection(self):
        self.assertEqual(execute.inputs(self.environment("https://example.invalid/a?sig=test")), "https://example.invalid/a?sig=test")
        for url in ("https://user:pass@example.invalid/a", "https://example.invalid/a\ninvalid"):
            with self.assertRaisesRegex(ValueError, "INVALID_DEM_URL"):
                execute.inputs(self.environment(url))

    def test_url_never_in_argv_or_child_environment(self):
        url = "https://private.example.invalid/a?signature=synthetic"
        with patch.object(execute.subprocess, "run") as subprocess_run, patch.dict(execute.os.environ, {"A91_DEMO_URL": url}):
            subprocess_run.return_value.returncode = 0
            self.assertEqual(execute.download(Path("/tmp/synthetic.dem"), url), 0)
            argv = subprocess_run.call_args.args[0]
            kwargs = subprocess_run.call_args.kwargs
            self.assertNotIn(url, " ".join(argv))
            self.assertNotIn("A91_DEMO_URL", kwargs["env"])
            self.assertIn(url.encode(), kwargs["input"])
            self.assertIn("--config", argv)

    def test_private_host_query_and_header_never_upload(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            for leak in ("private.example.invalid", "?signature=abc", "Authorization: redacted", "A91_DEMO_URL"):
                (directory / "a91_real_dem_report.json").write_text(json.dumps({"leak": leak}))
                with self.assertRaisesRegex(ValueError, "ARTIFACT_SECURITY_FAILURE"):
                    execute.seal(directory, "https://private.example.invalid/a")

    def test_preparser_download_validation_failure_never_calls_parser(self):
        for reason in ("A91_DEM_SIZE_MISMATCH", "A91_DEM_SHA256_MISMATCH"):
            with tempfile.TemporaryDirectory() as temp:
                env = self.environment("https://example.invalid/a")
                env.update(RUNNER_TEMP=temp, GITHUB_EVENT_NAME="workflow_dispatch", GITHUB_REF="refs/heads/main")
                with patch.dict(execute.os.environ, env, clear=True), patch.object(execute, "download", return_value=0), patch.object(execute, "validate_download", side_effect=ValueError(reason)), patch.object(execute, "run") as run:
                    self.assertEqual(execute.main(), 1)
                    run.assert_not_called()
                    self.assertFalse(list(Path(temp).glob("a91-private-*")))

    def test_structure_failure_stops_before_python_or_wasm(self):
        with tempfile.TemporaryDirectory() as temp:
            env = self.environment("https://example.invalid/a")
            env.update(RUNNER_TEMP=temp, GITHUB_EVENT_NAME="workflow_dispatch", GITHUB_REF="refs/heads/main")
            with patch.dict(execute.os.environ, env, clear=True), patch.object(execute, "download", return_value=0), patch.object(execute, "validate_download"), patch.object(execute, "run", return_value=1) as run:
                self.assertEqual(execute.main(), 1)
                self.assertEqual(run.call_count, 1)
                self.assertIn("validate_structure.py", run.call_args.args[0][1])
                report = json.loads((Path(temp) / "a91-artifacts/a91_real_dem_report.json").read_text())
                self.assertEqual(report["reason"], "A91_DEM_STRUCTURE_INVALID")

    def test_cleanup_failure_blocks_all_uploads(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.dict(execute.os.environ, {"RUNNER_TEMP": temp}, clear=True), patch.object(execute, "clean", side_effect=ValueError("CLEANUP_FAILURE")), patch.object(execute, "run") as run:
                self.assertEqual(execute.main(), 1)
                run.assert_not_called()
                self.assertFalse((Path(temp) / "a91-upload-safe").exists())
                self.assertFalse((Path(temp) / "a91-artifacts").exists())


if __name__ == "__main__":
    unittest.main()