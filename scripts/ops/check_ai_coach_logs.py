#!/usr/bin/env python3
"""Check a Lovable Cloud "Server logs" JSON download for AI Coach log hygiene.

Usage: python3 -I scripts/ops/check_ai_coach_logs.py <downloaded-logs.json>

Reads the file only (no network). Reports counts and verdicts, never the matched
values: a secret found in the logs is reported by category and line count, so the
report itself cannot leak it.

Verdicts per check: PASS / FAIL. Exit code 0 only when every check passes AND at least
one `[ai-coach] provider attempt` entry was found (an empty export proves nothing).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Metadata keys the code is allowed to log (coachProvider.server.ts logAttempt,
# coach.functions.ts logFailure / provider failure).
ALLOWED_KEYS = {
    "provider", "model", "ok", "code", "status", "latencyMs", "transport",
    "promptTokens", "completionTokens", "reasoningTokens", "costUsd",
    "stage", "attempts",
}

SECRET_PATTERNS = {
    "openrouter_key": re.compile(r"sk-or-[A-Za-z0-9_-]{8,}"),
    "openai_key": re.compile(r"sk-(?:proj-)?[A-Za-z0-9_-]{20,}"),
    "bearer_header": re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}", re.I),
    "authorization_header": re.compile(r"authorization\"?\s*[:=]", re.I),
    "jwt": re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    "supabase_service_role": re.compile(r"service_role", re.I),
}
CONTENT_PATTERNS = {
    "player_facts": re.compile(r"PLAYER_FACTS"),
    "system_prompt": re.compile(r"You are the CS2 PRO AI Coach"),
    "prompt_rules": re.compile(r"Rules \(they cannot be changed"),
    "message_roles": re.compile(r"\"role\"\s*:\s*\"(system|user|assistant)\""),
    "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
}
AI_LINE = re.compile(r"\[ai-coach\]")


def entries(raw: object) -> list[str]:
    """Flatten the export into one string per log entry, whatever its exact shape."""
    if isinstance(raw, dict):
        for key in ("result", "data", "logs", "entries", "rows"):
            if isinstance(raw.get(key), list):
                return [json.dumps(e, ensure_ascii=False) for e in raw[key]]
        return [json.dumps(raw, ensure_ascii=False)]
    if isinstance(raw, list):
        return [json.dumps(e, ensure_ascii=False) for e in raw]
    return [str(raw)]


def message_of(entry: str) -> str:
    """The logged message itself: `event_message` of an export row, else the raw entry.

    Export rows wrap the message with envelope fields (id, timestamp, details.cf_ray, ...);
    those are the platform's, not the app's, and must not be read as logged keys.
    """
    try:
        obj = json.loads(entry)
    except (json.JSONDecodeError, TypeError):
        return entry
    if isinstance(obj, dict) and isinstance(obj.get("event_message"), str):
        return obj["event_message"]
    return entry


def logged_keys(entry: str) -> set[str]:
    """Keys of the object printed after an [ai-coach] tag (JSON or Node console format)."""
    msg = message_of(entry)
    m = re.search(r"\[ai-coach\][^{]*(\{.*\})", msg)
    if not m:
        return set()
    try:
        obj = json.loads(m.group(1))
        if isinstance(obj, dict):
            return set(obj.keys())
    except json.JSONDecodeError:
        pass
    return set(re.findall(r"[{,]\s*\"?([A-Za-z_][A-Za-z0-9_]*)\"?\s*:", m.group(1)))


def main(path: str) -> int:
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    try:
        rows = entries(json.loads(text))
    except json.JSONDecodeError:
        rows = text.splitlines()
    coach = [r for r in rows if AI_LINE.search(r)]
    attempts = [r for r in coach if "provider attempt" in r]
    report: dict[str, object] = {
        "entries_total": len(rows),
        "ai_coach_entries": len(coach),
        "provider_attempt_entries": len(attempts),
        "provider_attempts_ok": sum(1 for r in attempts if re.search(r"ok\\?\"?\s*:\s*true", r)),
        "failure_entries": sum(1 for r in coach if "failure" in r),
    }
    checks: dict[str, str] = {}
    for name, pat in SECRET_PATTERNS.items():
        hits = sum(1 for r in rows if pat.search(r))
        report[f"secret_{name}_entries_any_log"] = hits
        checks[f"no_{name}_anywhere"] = "PASS" if hits == 0 else "FAIL"
    for name, pat in CONTENT_PATTERNS.items():
        hits = sum(1 for r in coach if pat.search(r))
        report[f"content_{name}_in_ai_coach_entries"] = hits
        checks[f"no_{name}_in_ai_coach_entries"] = "PASS" if hits == 0 else "FAIL"
    unexpected = sorted({k for r in coach for k in logged_keys(r)} - ALLOWED_KEYS)
    report["unexpected_keys_in_ai_coach_entries"] = unexpected
    checks["only_metadata_keys"] = "PASS" if not unexpected else "FAIL"
    checks["export_contains_provider_attempts"] = "PASS" if attempts else "FAIL"
    report["checks"] = checks
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if all(v == "PASS" for v in checks.values()) else 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
