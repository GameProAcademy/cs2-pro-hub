"""demoparser2 execution boundary.

Only this module touches the parser library. Its job is narrow on purpose:

1. run demoparser2 0.42.0 and collect the RAW material (header dict + event
   tables as plain records), keeping "stream could not be read" distinct from
   "stream is empty";
2. convert parser exceptions into the three semantic demo failures
   (invalid / corrupted / unsupported) and let any other exception bubble up so
   `app.py` classifies it as `PARSER_ERROR`;
3. hand the raw material to `adapter.py`, which owns the translation into the
   APP contract (`RawParserOutput`).

The parser model and the APP contract are deliberately separate layers: the
parser library can be swapped without touching the canonical pipeline.

NULL means "no evidence". Nothing here fabricates a tickrate, a score, teams, a
duration or a match date.

Known limitation (documented, not hidden): the parse runs in a worker thread via
`asyncio.to_thread`. A `PARSE_TIMEOUT` frees the HTTP request but does NOT
interrupt the native demoparser2 call already in flight; the container's own
memory/CPU ceilings and `MAX_DEMO_BYTES` are what bound that work.
"""

from __future__ import annotations

from typing import Any

from adapter import build_raw_parser_output
from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError

#: Substrings that are POSITIVE evidence about the file itself, not about a bug
#: in this worker. Matched case-insensitively against the parser message.
_INVALID_SIGNATURES = (
    "not a valid demo",
    "invalid demo",
    "invalid header",
    "unknown magic",
    "wrong magic",
    "hl2demo",
    "failed to read header",
)
_CORRUPTED_SIGNATURES = (
    "unexpected eof",
    "unexpected end of file",
    "truncated",
    "corrupt",
    "malformed packet",
)
_UNSUPPORTED_SIGNATURES = (
    "unsupported demo",
    "csgo demo",
    "protocol version",
    "unsupported protocol",
)

#: Event tables read from the demo. Each one is optional: a table that cannot be
#: read stays `None` (unknown) instead of becoming an empty list (negative
#: evidence). See `adapter.SUPPORTED_EVENTS` for the contract mapping.
_EVENT_TABLES = (
    "player_death",
    "player_hurt",
    "player_blind",
    "bomb_planted",
    "bomb_defused",
    "bomb_exploded",
)


def classify_parser_exception(exc: BaseException) -> BaseException:
    """Return a semantic demo error when there is positive evidence, else `exc`."""
    message = str(exc).lower()
    if any(token in message for token in _CORRUPTED_SIGNATURES):
        return CorruptedDemoError(str(exc))
    if any(token in message for token in _UNSUPPORTED_SIGNATURES):
        return UnsupportedDemoError(str(exc))
    if any(token in message for token in _INVALID_SIGNATURES):
        return InvalidDemoError(str(exc))
    return exc


def _records(frame: Any) -> list[dict[str, Any]]:
    """Normalise a pandas DataFrame (or list) into plain records."""
    if frame is None:
        return []
    if isinstance(frame, list):
        return [row for row in frame if isinstance(row, dict)]
    to_dict = getattr(frame, "to_dict", None)
    if callable(to_dict):
        rows = to_dict(orient="records")
        return [row for row in rows if isinstance(row, dict)]
    return []


def extract_raw_material(demo: Any) -> dict[str, Any]:
    """Collect the untouched demoparser2 material for the adapter."""
    warnings: list[str] = []
    raw: dict[str, Any] = {"warnings": warnings}

    raw["header"] = dict(demo.parse_header() or {})
    raw["round_starts"] = _records(demo.parse_event("round_start"))
    raw["round_ends"] = _records(demo.parse_event("round_end"))

    for name in _EVENT_TABLES:
        try:
            raw[name] = _records(demo.parse_event(name))
        except Exception:  # noqa: BLE001 - optional stream, unknown != empty
            raw[name] = None
            warnings.append(f"{name}_unavailable")

    try:
        raw["players"] = _records(demo.parse_player_info())
    except Exception:  # noqa: BLE001 - optional section
        raw["players"] = []
        warnings.append("player_info_unavailable")

    return raw


def parse_demo_file(path: str) -> dict[str, Any]:
    """Parse a `.dem` file into the `RawParserOutput` sections.

    Sections the demo does not provide stay absent and are reported in
    `warnings`; they are never filled with guesses.
    """
    try:
        from demoparser2 import DemoParser  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - environment specific
        raise RuntimeError("demoparser2 is not available in this build") from exc

    try:
        raw = extract_raw_material(DemoParser(path))
    except BaseException as exc:  # noqa: BLE001 - classified below
        raise classify_parser_exception(exc) from exc

    return build_raw_parser_output(raw)
