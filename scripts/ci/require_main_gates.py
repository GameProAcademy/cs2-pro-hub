#!/usr/bin/env python3
"""Evaluate the results of the gates that must pass on main.

Input: NEEDS_JSON, the `toJSON(needs)` context of the aggregate job, i.e.
{"<job id>": {"result": "success|failure|cancelled|skipped", ...}, ...}.

A required gate passes ONLY with result "success". "skipped", "cancelled",
"failure", a missing entry, or any unknown value fails the aggregate. A job
that is skipped by an `if:` reports "Success" to GitHub on its own check, so
requiring that check directly would not block a merge; this evaluator is what
turns a skipped required gate into a failure.
"""
from __future__ import annotations

import json
import os
import sys

# Gates that must SUCCEED for every push to main and every pull request to main.
REQUIRED = {
    "web-quality": "Web tests / lint / build",
    "contract-gate": "Contract-sensitive parser tests (complete parser suite)",
    "f553-r11-2-execution": "F553 R11.2 EXECUTION",
}
# Jobs of the same workflow that legitimately do not run for main.
NOT_APPLICABLE = {
    "parser-quality": "runs only for infra/cs2-parser-worker-v8",
}


def evaluate(needs: object) -> tuple[bool, list[dict[str, str]]]:
    rows: list[dict[str, str]] = []
    ok = True
    if not isinstance(needs, dict):
        return False, [{"gate": "<needs context>", "name": "", "result": "invalid", "verdict": "BLOCKED"}]
    for job, name in sorted(REQUIRED.items()):
        entry = needs.get(job)
        result = entry.get("result") if isinstance(entry, dict) else None
        if not isinstance(result, str) or not result:
            result = "absent"
        passed = result == "success"
        ok = ok and passed
        rows.append({"gate": job, "name": name, "result": result, "verdict": "PASS" if passed else "BLOCKED"})
    # A needed job that this evaluator does not know is a configuration error:
    # someone added a gate to `needs` without declaring whether it is required.
    for job in sorted(set(needs) - set(REQUIRED)):
        ok = False
        rows.append({"gate": job, "name": "", "result": "undeclared", "verdict": "BLOCKED"})
    return ok, rows


def render(ok: bool, rows: list[dict[str, str]]) -> str:
    lines = [
        f"## Main required gates: {'PASS' if ok else 'BLOCKED'}",
        "",
        "| Gate | Job | Result | Verdict |",
        "| --- | --- | --- | --- |",
    ]
    lines += [f"| {row['name'] or '-'} | `{row['gate']}` | {row['result']} | {row['verdict']} |" for row in rows]
    lines += ["", "Not applicable to main (not evaluated):"]
    lines += [f"- `{job}`: {reason}" for job, reason in sorted(NOT_APPLICABLE.items())]
    return "\n".join(lines) + "\n"


def main() -> int:
    try:
        needs = json.loads(os.environ.get("NEEDS_JSON", ""))
    except json.JSONDecodeError:
        needs = None
    ok, rows = evaluate(needs)
    summary = render(ok, rows)
    print(summary)
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if target:
        with open(target, "a", encoding="utf-8") as handle:
            handle.write(summary)
    for row in rows:
        level = "notice" if row["verdict"] == "PASS" else "error"
        print(f"::{level} title=Main gate {row['gate']}::{row['result']} -> {row['verdict']}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
