import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/r5_8_3_release_preflight.py"


def test_direct_workflow_entrypoint_resolves_shared_module_without_pythonpath():
    result = subprocess.run(
        (sys.executable, str(SCRIPT), "--self-check"),
        cwd=ROOT,
        env={},
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "R5_8_3_IMPORT_OK"


def test_preflight_source_remains_read_only():
    source = SCRIPT.read_text(encoding="utf-8")
    for forbidden in (
        "workflow_dispatches(",
        "/v1/parse",
        "claim_demo_parse_message",
        "canonical_authorization = true",
    ):
        assert forbidden not in source