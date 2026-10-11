#!/usr/bin/env python3
"""Prove that the parser CI job collects every parser test file.

A hand-maintained list of test files silently skips whatever is not on it.
This check runs pytest's own collection in services/cs2-demo-parser and fails
when a tests/test_*.py file on disk contributes no collected test, or when
collection itself reports an error. It runs no test and needs no demo.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARSER = ROOT / "services" / "cs2-demo-parser"
NODE = re.compile(r"^(tests/[^:\s]+\.py)::")


def collected_files(output: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for line in output.splitlines():
        match = NODE.match(line.strip())
        if match:
            counts[match.group(1)] = counts.get(match.group(1), 0) + 1
    return counts


def evaluate(on_disk: set[str], collected: dict[str, int], returncode: int) -> dict:
    missing = sorted(on_disk - set(collected))
    return {
        "status": "PASS" if returncode == 0 and on_disk and not missing else "FAIL",
        "collectionExitCode": returncode,
        "testFilesOnDisk": len(on_disk),
        "testFilesCollected": len(set(collected) & on_disk),
        "testsCollected": sum(collected.values()),
        "filesWithNoCollectedTest": missing,
    }


def main(parser_dir: Path = PARSER) -> int:
    on_disk = {str(path.relative_to(parser_dir)) for path in (parser_dir / "tests").glob("test_*.py")}
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider"],
        cwd=parser_dir, capture_output=True, text=True, check=False,
    )
    report = evaluate(on_disk, collected_files(result.stdout), result.returncode)
    print("PARSER_TEST_COLLECTION " + json.dumps(report, sort_keys=True))
    if report["status"] != "PASS":
        print(result.stdout[-2000:], file=sys.stderr)
        print(result.stderr[-2000:], file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else PARSER))
