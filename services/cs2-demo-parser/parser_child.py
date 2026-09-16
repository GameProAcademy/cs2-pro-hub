"""Isolated demoparser2 child process.

This module deliberately has no worker/HTTP lifecycle. It executes the existing
parser boundary in a separate OS process so a native crash cannot take down the
durable queue consumer. The parent owns timeout/termination and interprets the
small JSON result written to disk.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError
from parser import parse_demo_file


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_path")
    parser.add_argument("output_path")
    args = parser.parse_args()

    output_path = Path(args.output_path)
    try:
        result = parse_demo_file(args.input_path)
        output_path.write_text(
            json.dumps({"ok": True, "result": result}, ensure_ascii=False),
            encoding="utf-8",
        )
        return 0
    except InvalidDemoError as exc:
        payload = {"ok": False, "error_type": "InvalidDemoError", "message": str(exc)}
    except CorruptedDemoError as exc:
        payload = {"ok": False, "error_type": "CorruptedDemoError", "message": str(exc)}
    except UnsupportedDemoError as exc:
        payload = {"ok": False, "error_type": "UnsupportedDemoError", "message": str(exc)}
    except BaseException as exc:  # noqa: BLE001 - child boundary must serialize Python failures
        payload = {"ok": False, "error_type": "ParserError", "message": type(exc).__name__}

    output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
