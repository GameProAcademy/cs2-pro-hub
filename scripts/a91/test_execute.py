"""Synthetic mechanics only. No parser calls or network access."""
import hashlib
import importlib.util
import json
import subprocess
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

    def test_finalization_preserves_rich_parity_failure_report(self):
        with tempfile.TemporaryDirectory() as temp:
            report_path = Path(temp) / "a91_real_dem_report.json"
            rich_report = {
                "schema_version": 1,
                "status": "FAIL",
                "reason": "PARITY_MISMATCH",
                "parity": {
                    "status": "FAIL",
                    "mismatches": [{"field": "header", "reason": "SEMANTIC_MISMATCH"}],
                },
                "determinism": {"status": "PASS", "comparisons": []},
            }
            report_path.write_text(json.dumps(rich_report))
            self.assertTrue(execute.is_final_decision_report(report_path, "finalization"))
            self.assertFalse(execute.is_final_decision_report(report_path, "python_run_1"))
            # Exercise the exact finalization decision guard used by main().
            preserve = execute.is_final_decision_report(report_path, "finalization")
            if not preserve:
                report_path.write_text(json.dumps({"status": "FAIL", "reason": "A91_RUNTIME_RESOURCE_FAILURE"}))
            final = json.loads(report_path.read_text())
            self.assertEqual(final["reason"], "PARITY_MISMATCH")
            self.assertEqual(final["parity"]["mismatches"][0]["field"], "header")

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
        sensitive = {
            "A91_DEMO_URL": url,
            "EXPECTED_SHA256": execute.SHA,
            "EXPECTED_SIZE_BYTES": str(execute.SIZE),
            "AUTHORIZATION_REF": execute.AUTH,
            "DEMO_FILENAME": execute.FILENAME,
            "DEM_SHA256": execute.SHA,
            "DEM_SIZE": str(execute.SIZE),
            "DEM_AUTH": execute.AUTH,
        }
        with patch.object(execute.subprocess, "run") as subprocess_run, patch.dict(execute.os.environ, sensitive, clear=True):
            subprocess_run.return_value.returncode = 0
            self.assertEqual(execute.download(Path("/tmp/synthetic.dem"), url), 0)
            argv = subprocess_run.call_args.args[0]
            kwargs = subprocess_run.call_args.kwargs
            self.assertNotIn(url, " ".join(argv))
            for key in sensitive:
                self.assertNotIn(key, kwargs["env"])
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


    def test_python_digest_is_resealed_with_ecmascript_canonicalization(self):
        # These values serialize differently under Python json.dumps and JS JSON.stringify.
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "python_run_1.json"
            value = {
                "runtime": "PYTHON",
                "status": "SUCCEEDED",
                "normalizedResult": {"x": 1.0, "y": 1e-7, "z": "é"},
                "normalizedResultDigest": "0" * 64,
                "resultDigest": "0" * 64,
            }
            path.write_text(json.dumps(value))
            subprocess.run(
                ["node", str(Path(__file__).with_name("normalize_python_digest.mjs")), str(path)],
                check=True,
                capture_output=True,
                text=True,
            )
            actual = json.loads(path.read_text())
            expected = hashlib.sha256('{"x":1,"y":1e-7,"z":"é"}'.encode("utf-8")).hexdigest()
            self.assertEqual(actual["normalizedResultDigest"], expected)
            self.assertEqual(actual["resultDigest"], expected)
            self.assertIn('"x": 1.0', path.read_text())

    def test_python_digest_reseal_rejects_invalid_artifact(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "python_run_1.json"
            path.write_text(json.dumps({"runtime": "PYTHON", "status": "FAILED"}))
            result = subprocess.run(
                ["node", str(Path(__file__).with_name("normalize_python_digest.mjs")), str(path)],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)

    def test_python_reference_samples_recursively_match_wasm_shape(self):
        reference_path = Path(__file__).resolve().parents[2] / "services/cs2-demo-parser/python_reference.py"
        spec = importlib.util.spec_from_file_location("a91_python_reference_samples", reference_path)
        reference = importlib.util.module_from_spec(spec)
        assert spec is not None and spec.loader is not None
        spec.loader.exec_module(reference)

        rows = [
            {"tick": 1, "nested": {"positions": [1, 2, 3], "labels": ["a", "b", "c"]}},
            {"tick": 2, "nested": {"positions": [4, 5, 6], "labels": ["d", "e", "f"]}},
            {"tick": 3, "nested": {"positions": [7, 8, 9], "labels": ["g", "h", "i"]}},
        ]
        summary = reference.summarize_records(rows, sample_limit=2)

        self.assertEqual(summary["count"], 3)
        self.assertEqual(
            summary["samples"],
            [reference.sample(row, 2) for row in rows[:2]],
        )
        # Sampling must not truncate the complete digest or record count.
        self.assertEqual(summary["digest"], reference.digest(rows))
        self.assertEqual(summary["returnedFields"], ["nested", "tick"])

    def test_python_stable_matches_ecmascript_number_formatting(self):
        # Compare the canonical bytes against the same sorted-key JSON.stringify
        # algorithm used by the JS parity runner, including exponent thresholds,
        # negative zero and nested values. Integers beyond JS's safe range are
        # NOT part of this equality any more: rounding them to a double (the
        # previous behaviour) corrupted 64-bit identifiers. They must fail
        # closed here and travel as canonical decimal strings instead.
        value = {
            "nested": [1.0, 1e-6, 1e-7, 1e20, 1e21, -0.0, 1.2345678901234567],
            "maxSafeInteger": 9007199254740991,
            "text": "é",
        }
        js = r"""
const stable = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
};
process.stdout.write(stable(JSON.parse(process.argv[1])));
"""
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        result = subprocess.run(
            ["node", "-e", js, payload],
            check=True,
            capture_output=True,
            text=True,
        )
        reference_path = Path(__file__).resolve().parents[2] / "services/cs2-demo-parser/python_reference.py"
        spec = importlib.util.spec_from_file_location("a91_python_reference", reference_path)
        reference = importlib.util.module_from_spec(spec)
        assert spec is not None and spec.loader is not None
        spec.loader.exec_module(reference)
        self.assertEqual(reference.stable(value), result.stdout)
        for unsafe in (9007199254740993, 76561198012345679):
            with self.assertRaisesRegex(ValueError, "JSON_INTEGER_PRECISION_LOSS"):
                reference.stable({"steamid": unsafe})

if __name__ == "__main__":
    unittest.main()