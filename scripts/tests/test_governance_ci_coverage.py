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
