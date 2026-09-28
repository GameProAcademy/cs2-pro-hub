"""Separate-process invocation of the real demoparser2 production boundary."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
import time
import uuid


def stable_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False, default=str).encode("utf-8")


def main() -> int:
    if len(sys.argv) != 3:
        raise RuntimeError("usage: parser_process.py FIXTURE OUTPUT")
    fixture, output = Path(sys.argv[1]), Path(sys.argv[2])
    if fixture.read_bytes()[:8] != b"PBDEMS2\x00":
        raise RuntimeError("fixture is not CS2")
    parser_root = Path(__file__).resolve().parents[3] / "services/cs2-demo-parser"
    sys.path.insert(0, str(parser_root))
    os.environ["PARSER_SKIP_BOOTSTRAP"] = "1"
    from parser import parse_demo_file
    from settings import PARSER_VERSION

    started = time.time()
    parsed = parse_demo_file(str(fixture))
    encoded = stable_bytes(parsed)
    finished = time.time()
    envelope = {
        "parser_execution_id": str(uuid.uuid4()),
        "parser_version": PARSER_VERSION,
        "parser_contract": 1,
        "parser_start": started,
        "parser_finish": finished,
        "parser_exit_code": 0,
        "parser_result": "PASS",
        "parser_output_digest": hashlib.sha256(encoded).hexdigest(),
        "worker_pid": os.getpid(),
        "players": len(parsed.get("players") or []),
        "rounds": len(parsed.get("rounds") or []),
        "events": len(parsed.get("events") or []),
        "raw_evidence_present": isinstance(parsed.get("raw_evidence"), dict),
        "output": parsed,
    }
    output.write_bytes(stable_bytes(envelope))
    print(json.dumps({key: envelope[key] for key in (
        "parser_execution_id", "parser_version", "parser_output_digest", "worker_pid",
        "players", "rounds", "events", "raw_evidence_present")}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())