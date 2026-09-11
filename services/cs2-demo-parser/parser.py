"""demoparser2 execution boundary.

Only this module touches the parser library. It converts parser exceptions into
the three semantic demo failures (invalid / corrupted / unsupported) and lets any
other exception bubble up unchanged so `app.py` can classify it as
`PARSER_ERROR` — an unexpected internal failure is NEVER reported as an invalid
demo.

NULL means "no evidence". Nothing here fabricates a tickrate, a score, teams, a
duration or a match date.
"""

from __future__ import annotations

from typing import Any

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


def _first(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value is not None and value != "":
            return value
    return None


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


def parse_demo_file(path: str) -> dict[str, Any]:
    """Parse a `.dem` file into the GATE 1E response sections.

    Sections that the demo does not provide stay empty / null and are reported in
    `warnings`; they are never filled with guesses.
    """
    try:
        from demoparser2 import DemoParser  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - environment specific
        raise RuntimeError("demoparser2 is not available in this build") from exc

    warnings: list[str] = []
    try:
        demo = DemoParser(path)
        raw_header = demo.parse_header() or {}
        header_source = {str(k): v for k, v in dict(raw_header).items()}

        kills = _records(demo.parse_event("player_death"))
        round_ends = _records(demo.parse_event("round_end"))
        round_starts = _records(demo.parse_event("round_start"))
        blinds = _records(demo.parse_event("player_blind"))
        bomb_planted = _records(demo.parse_event("bomb_planted"))
        bomb_defused = _records(demo.parse_event("bomb_defused"))
        try:
            players = _records(demo.parse_player_info())
        except Exception as exc:  # noqa: BLE001 - optional section
            players = []
            warnings.append("player_info_unavailable")
            del exc
    except BaseException as exc:  # noqa: BLE001 - classified below
        raise classify_parser_exception(exc) from exc

    tickrate = _first(header_source, "tickrate", "tick_rate")
    header = {
        "map": _first(header_source, "map_name", "map"),
        "game_version": _first(header_source, "game_version", "client_name", "server_name"),
        "tickrate": float(tickrate) if isinstance(tickrate, (int, float)) else None,
        # Duration / match date / score / teams require evidence this worker does
        # not derive here; the APP treats absence as absence.
        "duration_seconds": None,
        "match_date": None,
        "score": {},
        "teams": {},
    }
    if header["map"] is None:
        warnings.append("map_unavailable")
    if header["tickrate"] is None:
        warnings.append("tickrate_unavailable")
    if not round_ends:
        warnings.append("round_end_unavailable")

    events: list[dict[str, Any]] = []
    for name, rows in (
        ("player_death", kills),
        ("round_start", round_starts),
        ("round_end", round_ends),
        ("player_blind", blinds),
        ("bomb_planted", bomb_planted),
        ("bomb_defused", bomb_defused),
    ):
        for row in rows:
            events.append({"type": name, "data": row})

    return {
        "header": header,
        "players": players,
        "rounds": round_ends,
        "events": events,
        "warnings": warnings,
    }
