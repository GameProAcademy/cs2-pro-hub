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

    def test_seal_allows_public_url_but_rejects_private_url_and_dem(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            public_reports = (
                "a91_real_dem_report.json",
                "parity_report.json",
                "determinism_report.json",
            )

            def write_reports(value):
                for name in public_reports:
                    (directory / name).write_text(json.dumps(value))

            write_reports({"source": "https://example.com/public-evidence"})
            execute.seal(directory)

            write_reports({"private": "https://example.invalid/signed"})
            with self.assertRaisesRegex(ValueError, "ARTIFACT_SECURITY_FAILURE"):
                execute.seal(directory, "https://example.invalid/signed")

            write_reports({
                "authorization": {"authorizationRef": execute.AUTH},
                "source": "https://example.com/public-evidence",
            })
            execute.seal(directory)

            write_reports({"padding": "x" * (3 * 1024 * 1024)})
            execute.seal(directory)

            write_reports({"url": "https://example.com/evidence?signature=secret"})
            with self.assertRaisesRegex(ValueError, "ARTIFACT_SECURITY_FAILURE"):
                execute.seal(directory)

            write_reports({"status": "FAIL", **execute.LOCKS})
            (directory / "synthetic.dem").touch()
            execute.seal(directory)  # Explicit allowlist; unrelated private files are not uploadable.

            (directory / "synthetic.dem").unlink()
            (directory / "python_run_1.json").write_text(json.dumps({"status": "SUCCEEDED"}))
            execute.seal(directory)

    def test_stage_failure_preserves_specific_reason(self):
        with tempfile.TemporaryDirectory() as temp:
            env = self.environment("https://example.invalid/a")
            env.update(RUNNER_TEMP=temp, GITHUB_EVENT_NAME="workflow_dispatch", GITHUB_REF="refs/heads/main")
            with patch.dict(execute.os.environ, env, clear=True), patch.object(execute, "download", return_value=0), patch.object(execute, "validate_download"), patch.object(execute, "run", return_value=1):
                self.assertEqual(execute.main(), 1)
                base = Path(temp) / "a91-artifacts"
                report = json.loads((base / "a91_real_dem_report.json").read_text())
                parity = json.loads((base / "parity_report.json").read_text())
                determinism = json.loads((base / "determinism_report.json").read_text())
                self.assertEqual(report["reason"], "A91_DEM_STRUCTURE_INVALID")
                self.assertEqual(parity["status"], "NOT_RUN")
                self.assertEqual(determinism["status"], "NOT_RUN")

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
                "DEM_SHA256": execute.SHA, "DEM_SIZE": str(execute.SIZE), "DEM_AUTH": execute.AUTH,
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

            # The private DEM URL remains forbidden.
            (directory / "a91_real_dem_report.json").write_text(
                json.dumps({"leak": "https://private.example.invalid/a"})
            )
            with self.assertRaisesRegex(ValueError, "ARTIFACT_SECURITY_FAILURE"):
                execute.seal(directory, "https://private.example.invalid/a")

            # Credential-bearing URL/query/header patterns remain forbidden.
            for leak in ("?signature=abc", "Authorization: redacted", "A91_DEMO_URL"):
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