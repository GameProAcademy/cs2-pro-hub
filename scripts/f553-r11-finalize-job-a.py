#!/usr/bin/env python3
"""Finalize Job A gate evidence from steps that actually executed in this run.

This does not manufacture PASS states: the caller must provide successful
GitHub Actions step outcomes for Docker, parser tests and browser validation.
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "docs/release-gates/f553-r11-execution-evidence.json"
EXPECTED = {
    "docker": "F553_DOCKER_OUTCOME",
    "parser_tests": "F553_PARSER_TESTS_OUTCOME",
    "browser": "F553_BROWSER_OUTCOME",
}

evidence = json.loads(PATH.read_text())
issues = []
for gate, env_name in EXPECTED.items():
    outcome = os.environ.get(env_name, "")
    if outcome != "success":
        evidence["gates"][gate] = "FAIL"
        issues.append(f"{gate} step outcome={outcome or 'missing'}")
    else:
        evidence["gates"][gate] = "PASS"
        evidence.setdefault("observations", {}).setdefault("ci_validation", {})[gate] = {
            "step_outcome": outcome,
            "executed": True,
        }

if evidence["gates"].get("final_ci") != "NOT_PROVEN":
    evidence["gates"]["final_ci"] = "NOT_PROVEN"

if issues:
    evidence.setdefault("blockers", []).append({
        "BLOCKER_CODE": "R11_JOB_A_CI_VALIDATION_FAILED",
        "ACTUAL_OUTPUT": "; ".join(issues),
        "RUN_ID": evidence["run_id"],
        "COMMIT_SHA": evidence["commit_sha"],
        "WORKFLOW_RUN_ID": evidence["workflow_run_id"],
    })
    evidence["final_decision"] = "BLOCKED"
else:
    non_final = [g for g in evidence["gates"] if g != "final_ci"]
    evidence["final_decision"] = (
        "READY_FOR_INDEPENDENT_ATTESTATION"
        if all(evidence["gates"].get(g) == "PASS" for g in non_final)
        else "BLOCKED"
    )

PATH.write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps({
    "final_decision": evidence["final_decision"],
    "gates": evidence["gates"],
    "issues": issues,
}))
if issues:
    sys.exit(1)
