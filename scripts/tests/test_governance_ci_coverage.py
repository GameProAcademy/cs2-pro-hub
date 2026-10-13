"""Every release governance test runs on every pull request, with no hand list.

A hand-maintained file list let test_f553_r11_post_completion.py fail on main
for an unknown time without any workflow running it.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_main_required_gates_runs_the_whole_governance_directory():
    import re

    workflow = (ROOT / ".github/workflows/quality-gates.yml").read_text()
    block = workflow[workflow.index("  main-required-gates:"):]
    step = block[block.index("- name: Release governance tests"):]
    step = step[:step.index("- name: Require every main gate")]
    assert re.search(r"python -m pytest -q -rs scripts/tests\s*$", step, re.M), step
    assert "--ignore" not in step and "--deselect" not in step and " -k " not in step
    assert "continue-on-error" not in step and "|| true" not in step
    assert "fetch-depth: 0" in block


def test_every_governance_test_file_is_inside_that_directory():
    assert sorted(p.name for p in (ROOT / "scripts/tests").glob("test_*.py"))


def test_activation_gate_reports_failed_triggers_instead_of_skipping():
    # A skipped gate proves nothing and says nothing. When F553 or the queue
    # probes fail, the gate must still run and report FAIL with the reason.
    import yaml

    workflow = yaml.safe_load((ROOT / ".github/workflows/h3-e-activation-gate.yml").read_text())
    on = workflow.get(True) or workflow.get("on")
    assert set(on["workflow_run"]["workflows"]) == {"F553 R11.2 post-completion attestation", "Queue Semantics Probe"}
    condition = workflow["jobs"]["activation-gate"]["if"]
    assert "github.event.workflow_run.conclusion == 'success'" in condition
    assert "github.event.workflow_run.conclusion == 'failure'" in condition
    assert "cancelled" not in condition and "skipped" not in condition


def test_f553_attestation_publishes_its_decision():
    source = (ROOT / "scripts/f553-r11-post-completion-attest.py").read_text()
    assert "title=F553 post-completion decision::" in source
