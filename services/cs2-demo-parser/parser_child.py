"""Parser child process: runs demoparser2 where a crash cannot take the worker down.

Usage: python -m parser_child <demo_path> <result_path>

The child parses with the SAME boundary the rest of the worker uses
(`parser.parse_demo_file`); it changes no parser behaviour. It writes exactly
one JSON document to <result_path> (atomically) and exits 0 when that document
was written. Any other exit, or a missing/invalid document, is classified by
the parent from the process status alone.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

import errors as E
from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError

#: Optional address-space ceiling for the child (bytes). When the parser needs
#: more, allocation fails inside the child as MemoryError and is reported as
#: RESOURCE_EXHAUSTED instead of the kernel killing an arbitrary process.
MEMORY_LIMIT_ENV = "PARSER_CHILD_MEMORY_BYTES"
#: Set by parser_isolated to its own pid; the child refuses to run otherwise.
PARENT_ENV = "PARSER_CHILD_PARENT_PID"


def _apply_memory_limit() -> None:
    raw = os.environ.get(MEMORY_LIMIT_ENV, "").strip()
    if not raw:
        return
    import resource

    limit = int(raw)
    if limit <= 0:
        raise ValueError(f"{MEMORY_LIMIT_ENV} must be positive")
    resource.setrlimit(resource.RLIMIT_AS, (limit, limit))


def _write(result_path: Path, payload: dict) -> None:
    handle = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=result_path.parent, prefix=result_path.name + ".", suffix=".tmp", delete=False
    )
    try:
        with handle:
            json.dump(payload, handle, ensure_ascii=False, allow_nan=False)
        os.replace(handle.name, result_path)
    except BaseException:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
        raise


def run(demo_path: str, result_path: Path) -> int:
    from parser import parse_demo_file
    from parser import NON_DEMO_FAILURES

    try:
        result = parse_demo_file(demo_path)
    except InvalidDemoError:
        payload = {"ok": False, "error_type": "InvalidDemoError"}
    except CorruptedDemoError:
        payload = {"ok": False, "error_type": "CorruptedDemoError"}
    except UnsupportedDemoError:
        payload = {"ok": False, "error_type": "UnsupportedDemoError"}
    except BaseException as exc:  # noqa: BLE001 - the boundary reports the class, never the text
        failure_class = E.classify_exception(exc)
        payload = {"ok": False, "error_type": type(exc).__name__, "failure_class": failure_class}
        _write(result_path, payload)
        # Resource exhaustion and cancellation are also visible in the exit
        # status, so a parent that cannot read the file still classifies them.
        return 3 if isinstance(exc, NON_DEMO_FAILURES) else 0
    else:
        payload = {"ok": True, "result": result}
    _write(result_path, payload)
    return 0


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        return 64
    # Not a security boundary (parser.py is importable in the same image): it
    # keeps this module from being used as a stand-alone parse command, which
    # would run outside the execution ledger its parent records into.
    if os.environ.get(PARENT_ENV) != str(os.getppid()):
        return 77
    _apply_memory_limit()
    return run(argv[1], Path(argv[2]))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
