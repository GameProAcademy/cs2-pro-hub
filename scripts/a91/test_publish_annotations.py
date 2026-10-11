"""Annotations carry only bounded, already-public values."""
import json
import tempfile
import unittest
from pathlib import Path

import publish_annotations as annotations


class PublishAnnotations(unittest.TestCase):
    def test_safe_withholds_anything_that_is_not_a_bounded_code(self):
        for bad in ("https://example.invalid/demo.dem?sig=abc", "/tmp/secret/file", "Bearer abcdefgh12345678",
                    "free text with spaces", "a" * 97, "player\nname", "x=y&token=1", 2**60, float("nan"), object()):
            self.assertEqual(annotations.safe(bad), "<withheld>", repr(bad))
        for good in ("PASS", "WASM_RUNTIME_TRAP", "CWeaponGlock", "a" * 64, "REAL_DEM_FULL_FILE", 473748061, 0.5, True, None):
            self.assertEqual(annotations.safe(good), good)
        nested = annotations.safe({"ok": "PASS", "bad key!": 1, "url": "https://x.invalid", "rows": [1, "has space"]})
        self.assertEqual(nested, {"ok": "PASS", "url": "<withheld>", "rows": [1, "<withheld>"]})

    def test_real_gate_projection_never_leaks_and_is_bounded(self):
        secret = "https://private.example.invalid/demo.dem?X-Amz-Signature=deadbeef"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "a91_real_dem_report.json").write_text(json.dumps({
                "status": "FAIL", "reason": "PARITY_MISMATCH", "stage": "finalization", "note": secret,
                "fixture": {"filename": "furia-vs-gamerlegion-m1-cache.dem", "sizeBytes": 473748061,
                            "sha256": "0" * 64, "authorizationRef": "A9.1-M1-CACHE-REAL-DEM"},
                "runs": {"python": [{"runId": "python:abc:" + secret, "status": "SUCCEEDED", "normalizedDigest": "a" * 64,
                                     "durationMs": 217000.5}],
                         "wasm": [{"status": "SUCCEEDED", "normalizedDigest": "b" * 64, "durationMs": 1.0,
                                   "wasmMemory": {"peakBytes": 1486946304, "grenadeOutput": "COLUMN_MAJOR"}}]},
                "determinism": {"status": "PASS", "pythonDeterministic": True, "wasmDeterministic": True},
            }))
            (root / "parity_report.json").write_text(json.dumps({
                "status": "FAIL", "comparablePassCount": 13, "comparableFailCount": 1,
                "comparisons": [{"field": "grenades", "status": "FAIL", "mismatch_reason": "SEMANTIC_MISMATCH",
                                 "python_digest": "c" * 64}],
                "field_diagnostics": {"table_count": 40, "tables": [
                    {"table": "grenades", "status": "FAIL", "divergence_classes": ["ROW_COUNT"],
                     "python_row_count": 10, "wasm_row_count": 11, "fields": [{"field": "name", "sample": secret}]}]},
                "raw_output_diagnostics": {"status": "DIVERGENT", "tables": [
                    {"table": "grenades", "python": {"excluded_by_class": {"CKnife": 3}}}]},
            }))
            lines = annotations.emit(annotations.real_gate(root))
        self.assertLessEqual(len(lines), annotations.MAX_NOTICES)
        text = "\n".join(lines)
        self.assertNotIn("private.example", text)
        self.assertNotIn("Signature", text)
        self.assertNotIn("furia-vs-gamerlegion", text)  # filename is not projected
        self.assertIn('"status":"FAIL"', text)
        self.assertIn('"peakBytes":1486946304', text)
        self.assertIn('"CKnife":3', text)
        self.assertIn('"grenades":["FAIL","SEMANTIC_MISMATCH"]', text)
        for line in lines:
            self.assertTrue(line.startswith("::notice title=A91 "))
            self.assertNotIn("\n", line)
            self.assertLess(len(line.encode()), 4000)

    def test_missing_reports_are_stated(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertIn('"report":"MISSING"', "\n".join(annotations.emit(annotations.real_gate(Path(directory)))))
            self.assertIn('"report":"MISSING"', "\n".join(annotations.emit(annotations.public_fixture(Path(directory)))))

    def test_oversized_notice_is_replaced_not_cut(self):
        big = [("A91 big", {f"k{i}": "A" * 90 for i in range(64)})]
        line = annotations.emit(big)[0]
        self.assertIn('"truncated":true', line)

    def test_usage(self):
        self.assertEqual(annotations.main(["x"]), 2)
        self.assertEqual(annotations.main(["x", "other", "."]), 2)


if __name__ == "__main__":
    unittest.main()
