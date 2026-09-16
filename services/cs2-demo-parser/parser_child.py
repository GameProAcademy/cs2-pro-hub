"""Isolated demoparser2 child process.

This module deliberately has no worker/HTTP lifecycle. It executes the existing
parser boundary in a separate OS process so a native crash cannot take down the
durable queue consumer. The parent owns timeout/termination and interprets the
small JSON result written to disk.

Memory-safety note:
`parse_ticks()` can materialize one row per player for every requested tick.
Large public demos can therefore turn an otherwise bounded evidence sample into
millions of cells. The child applies a deterministic query cap before the parser
is invoked; the existing RAW evidence layer still records the returned sample as
SAMPLE coverage and never treats it as full tick extraction.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError
import parser as parser_module


def _bounded_tick_query(sample_ticks: list[int]) -> list[int]:
    """Choose an evenly distributed deterministic subset before demoparser2.

    The old implementation passed every distinct event tick to parse_ticks and
    only truncated after demoparser2 had already materialized the full result.
    That defeated the memory ceiling on large demos. This cap is intentionally
    applied at the query boundary.
    """
    try:
        limit = int(os.getenv("TICK_QUERY_LIMIT", "128"))
    except ValueError:
        limit = 128
    limit = max(16, min(limit, 512))
    if len(sample_ticks) <= limit:
        return sample_ticks
    if limit == 1:
        return [sample_ticks[0]]

    last = len(sample_ticks) - 1
    indices = [round(index * last / (limit - 1)) for index in range(limit)]
    return [sample_ticks[index] for index in indices]


_ORIGINAL_PARSE_TICKS = parser_module._parse_ticks


def _parse_ticks_bounded(demo, sample_ticks):
    bounded = _bounded_tick_query(list(sample_ticks))
    if len(bounded) != len(sample_ticks):
        print(
            f"parser_child_tick_query_bounded original={len(sample_ticks)} bounded={len(bounded)}",
            flush=True,
        )
    return _ORIGINAL_PARSE_TICKS(demo, bounded)


# Patch only the isolated child. The canonical parser module remains unchanged;
# the durable worker therefore keeps the same public parser contract while the
# killable child prevents oversized tick queries from exhausting the container.
parser_module._parse_ticks = _parse_ticks_bounded
parse_demo_file = parser_module.parse_demo_file


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
