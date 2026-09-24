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

`parse_grenades()` also has a second, independent native parsing mode. The
upstream Python binding enables both projectile parsing and grenade entity
inventory by default. For this worker we only need projectile trajectory rows;
the grenade entity inventory is not consumed by the current APP contract and
can multiply native memory use on large demos. The isolated child therefore
calls the same API with `grenades=False`, preserving projectile extraction while
disabling the unnecessary grenade-inventory pass.
"""

from __future__ import annotations

import argparse
import json
import os
import resource
from pathlib import Path
import threading

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


def _rss_bytes() -> int | None:
    """Return current child RSS in bytes from Linux procfs when available."""
    try:
        for line in Path("/proc/self/status").read_text(encoding="utf-8").splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    except (OSError, ValueError, IndexError):
        return None
    return None


def _rss_gb() -> float | None:
    """Return current child RSS from Linux procfs when available."""
    try:
        for line in Path("/proc/self/status").read_text(encoding="utf-8").splitlines():
            if line.startswith("VmRSS:"):
                kib = int(line.split()[1])
                return kib / 1024 / 1024
    except (OSError, ValueError, IndexError):
        return None
    return None


def _start_rss_monitor() -> tuple[threading.Event, threading.Thread]:
    """Emit bounded child RSS diagnostics while native parsing is running."""
    stop = threading.Event()

    def _run() -> None:
        while not stop.wait(5.0):
            rss = _rss_gb()
            if rss is not None:
                print(f"parser_child_rss rss_gb={rss:.3f}", flush=True)

    thread = threading.Thread(target=_run, name="parser-rss-monitor", daemon=True)
    thread.start()
    return stop, thread


_ORIGINAL_PARSE_TICKS = parser_module._parse_ticks


def _parse_ticks_bounded(demo, sample_ticks):
    bounded = _bounded_tick_query(list(sample_ticks))
    print(
        f"parser_child_stage=parse_ticks_start original={len(sample_ticks)} bounded={len(bounded)} rss_gb={_rss_gb()}",
        flush=True,
    )
    if len(bounded) != len(sample_ticks):
        print(
            f"parser_child_tick_query_bounded original={len(sample_ticks)} bounded={len(bounded)}",
            flush=True,
        )
    result = _ORIGINAL_PARSE_TICKS(demo, bounded)
    rows = len(result[0]) if isinstance(result, tuple) and result and isinstance(result[0], list) else "unknown"
    print(f"parser_child_stage=parse_ticks_complete rows={rows} rss_gb={_rss_gb()}", flush=True)
    return result


def _parse_grenades_safe(demo):
    """Parse projectile trajectories without the optional grenade inventory pass."""
    print(f"parser_child_stage=parse_grenades_start rss_gb={_rss_gb()} mode=projectiles_only", flush=True)
    method = getattr(demo, "parse_grenades", None)
    if not callable(method):
        return [], AttributeError("parse_grenades is unavailable")
    try:
        frame = method(grenades=False)
        rows = parser_module._records(frame)
        print(
            f"parser_child_stage=parse_grenades_complete rows={len(rows)} rss_gb={_rss_gb()} mode=projectiles_only",
            flush=True,
        )
        return rows, None
    except BaseException as exc:  # noqa: BLE001 - preserve capability failure as evidence
        print(
            f"parser_child_stage=parse_grenades_error type={type(exc).__name__} rss_gb={_rss_gb()} mode=projectiles_only",
            flush=True,
        )
        return [], exc


# Patch only the isolated child. The canonical parser module remains unchanged;
# the durable worker therefore keeps the same public parser contract while the
# killable child prevents oversized native queries from exhausting the container.
parser_module._parse_ticks = _parse_ticks_bounded
parser_module._parse_grenades = _parse_grenades_safe
parse_demo_file = parser_module.parse_demo_file


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_path")
    parser.add_argument("output_path")
    args = parser.parse_args()

    output_path = Path(args.output_path)
    stop_rss_monitor, rss_thread = _start_rss_monitor()
    print(f"parser_child_stage=parse_start rss_gb={_rss_gb()}", flush=True)
    try:
        result = parse_demo_file(args.input_path)
        print(f"parser_child_stage=parse_complete rss_gb={_rss_gb()}", flush=True)
        runtime = {
            "peak_rss_bytes": int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024,
            "final_rss_bytes": _rss_bytes(),
            "evidenceClass": "ISOLATED_PARSER_CHILD_RUNTIME",
        }
        output_path.write_text(
            json.dumps(
                {"ok": True, "result": result, "_child_runtime": runtime},
                ensure_ascii=False,
            ),
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
    finally:
        stop_rss_monitor.set()
        rss_thread.join(timeout=1.0)

    payload["_child_runtime"] = {
        "peak_rss_bytes": int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024,
        "final_rss_bytes": _rss_bytes(),
        "evidenceClass": "ISOLATED_PARSER_CHILD_RUNTIME",
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())