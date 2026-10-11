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


DETAIL_KEYS = ("scenario", "status", "detail", "job_status", "job_message", "error_code", "retry_count", "parser_executions",
               "execution_identities", "terminals", "leases", "complete_calls", "fail_calls", "raw_status", "raw_audit",
               "raw_chunks", "raw_chunks_verified", "raw_objects", "queued_messages", "closures", "canonical",
               "bridge_calls", "bridge_log", "worker_logs", "last_bridge_calls", "seconds")
UNSAFE = re.compile(r"(eyJ[A-Za-z0-9_\-.]+|token=[^&\s\"']+|Bearer \S+|https?://\S+)")


def clean(value):
    if isinstance(value, str):
        return UNSAFE.sub("<redacted>", value).replace("\n", " ").replace("\r", " ")[:900]
    if isinstance(value, list):
        return [clean(item) for item in value[:20]]
    if isinstance(value, dict):
        return {str(key)[:60]: clean(item) for key, item in list(value.items())[:30]}
    return value


def details(path: Path) -> list[str]:
    """One annotation per scenario that did not pass, and one compact line for the ones that did."""
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    lines = []
    scenarios = [item for item in report.get("scenarios", []) if isinstance(item, dict)]
    for item in [s for s in scenarios if s.get("status") != "PASS"][:8]:
        text = json.dumps(clean({key: item[key] for key in DETAIL_KEYS if key in item}), sort_keys=True, separators=(",", ":"))
        lines.append(f"::error title=Queue probe failure::{text[:3800]}")
    passed = {str(s.get("scenario"))[:70]: [s.get("seconds"), s.get("parser_executions"), s.get("retry_count"), s.get("job_status"),
                                             s.get("raw_chunks"), s.get("raw_objects")]
              for s in scenarios if s.get("status") == "PASS" and "seconds" in s}
    if passed:
        context = {key: report.get(key) for key in ("pgmq_version", "postgres_version", "notes") if key in report}
        context["first_job_message"] = next((s.get("job_message") for s in scenarios if s.get("job_message")), None)
        lines.append(f"::notice title=Queue probe passed scenarios::{json.dumps(clean({'context': context, 'seconds_executions_retries_status_chunks_objects': passed}), sort_keys=True, separators=(',', ':'))[:3800]}")
    return lines


def main(argv: list[str]) -> int:
    for path in argv[1:]:
        summary = summarize(Path(path))
        level = "notice" if summary.get("status") == "PASS" else "error"
        print(f"::{level} title=Queue probe::{json.dumps(summary, sort_keys=True, separators=(',', ':'))}")
        for line in details(Path(path)):
            print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
