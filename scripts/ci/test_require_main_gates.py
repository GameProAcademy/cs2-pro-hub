"""Every way a required gate can fail to succeed must block the aggregate."""
import importlib.util
import io
import json
import os
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("require_main_gates", Path(__file__).with_name("require_main_gates.py"))
gates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gates)

ALL_GREEN = {job: {"result": "success", "outputs": {}} for job in gates.REQUIRED}


def run(needs_json: str) -> tuple[int, str]:
    out = io.StringIO()
    with patch.dict(os.environ, {"NEEDS_JSON": needs_json}, clear=False), redirect_stdout(out):
        os.environ.pop("GITHUB_STEP_SUMMARY", None)
        code = gates.main()
    return code, out.getvalue()


class RequireMainGates(unittest.TestCase):
    def test_all_success_passes(self):
        code, text = run(json.dumps(ALL_GREEN))
        self.assertEqual(code, 0)
        self.assertIn("Main required gates: PASS", text)
        for job in gates.REQUIRED:
            self.assertIn(f"`{job}`", text)

    def test_each_gate_blocks_for_every_non_success_result(self):
        for job in gates.REQUIRED:
            for result in ("failure", "cancelled", "skipped", "timed_out", "neutral", "", "SUCCESS", "success "):
                with self.subTest(job=job, result=result):
                    needs = json.loads(json.dumps(ALL_GREEN))
                    needs[job]["result"] = result
                    code, text = run(json.dumps(needs))
                    self.assertEqual(code, 1)
                    self.assertIn("Main required gates: BLOCKED", text)
                    self.assertIn(f"::error title=Main gate {job}::", text)

    def test_absent_gate_blocks(self):
        for job in gates.REQUIRED:
            with self.subTest(job=job):
                needs = {name: value for name, value in ALL_GREEN.items() if name != job}
                code, text = run(json.dumps(needs))
                self.assertEqual(code, 1)
                self.assertIn("absent", text)
        for malformed in ({job: None for job in gates.REQUIRED}, {job: "success" for job in gates.REQUIRED},
                          {job: {"result": True} for job in gates.REQUIRED}):
            self.assertEqual(run(json.dumps(malformed))[0], 1)

    def test_missing_or_invalid_context_blocks(self):
        for payload in ("", "not json", "null", "[]", "{}", '"success"'):
            with self.subTest(payload=payload):
                self.assertEqual(run(payload)[0], 1)

    def test_undeclared_needed_job_blocks(self):
        needs = {**ALL_GREEN, "some-new-gate": {"result": "success"}}
        code, text = run(json.dumps(needs))
        self.assertEqual(code, 1)
        self.assertIn("undeclared", text)

    def test_not_applicable_jobs_are_named_and_never_required(self):
        self.assertFalse(set(gates.NOT_APPLICABLE) & set(gates.REQUIRED))
        _, text = run(json.dumps(ALL_GREEN))
        for job, reason in gates.NOT_APPLICABLE.items():
            self.assertIn(job, text)
            self.assertIn(reason, text)

    def test_summary_file_is_written(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "summary.md"
            with patch.dict(os.environ, {"NEEDS_JSON": json.dumps(ALL_GREEN), "GITHUB_STEP_SUMMARY": str(target)}), \
                    redirect_stdout(io.StringIO()):
                self.assertEqual(gates.main(), 0)
            self.assertIn("| Gate | Job | Result | Verdict |", target.read_text())


    def test_parser_governance_is_required_on_main(self):
        # The worker deploys from main; its governance job may no longer be skipped there.
        self.assertIn("parser-quality", gates.REQUIRED)
        workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/quality-gates.yml").read_text()
        self.assertNotRegex(workflow, r"(branches:|refs/heads/|base_ref == )[^\n]*infra/cs2-parser-worker-v8")
        self.assertIn("needs: [web-quality, contract-gate, parser-quality, f553-r11-2-execution]", workflow)
        needs = {**ALL_GREEN, "parser-quality": {"result": "skipped"}}
        self.assertEqual(run(json.dumps(needs))[0], 1)


if __name__ == "__main__":
    unittest.main()
