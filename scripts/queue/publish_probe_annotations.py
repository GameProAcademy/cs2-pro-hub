#!/usr/bin/env python3
"""Publish the queue probe verdicts as check annotations (scenario names and statuses only)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SAFE = re.compile(r"^[A-Za-z0-9_]{1,120}$")


def summarize(path: Path) -> dict:
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"report": "MISSING"}
    scenarios = [item for item in report.get("scenarios", []) if isinstance(item, dict)]
    name = lambda item: item["scenario"] if SAFE.fullmatch(str(item.get("scenario"))) else "withheld"  # noqa: E731
    return {
        "probe": report.get("probe") if SAFE.fullmatch(str(report.get("probe"))) else "withheld",
        "status": report.get("status") if report.get("status") in ("PASS", "FAIL") else "INVALID",
        "passed": sum(1 for item in scenarios if item.get("status") == "PASS"),
        "total": len(scenarios),
        "not_passed": [name(item) for item in scenarios if item.get("status") != "PASS"][:30],
        "known_defects": [str(item) for item in report.get("known_defects", []) if SAFE.fullmatch(str(item))][:10],
    }


def main(argv: list[str]) -> int:
    for path in argv[1:]:
        summary = summarize(Path(path))
        level = "notice" if summary.get("status") == "PASS" else "error"
        print(f"::{level} title=Queue probe::{json.dumps(summary, sort_keys=True, separators=(',', ':'))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
