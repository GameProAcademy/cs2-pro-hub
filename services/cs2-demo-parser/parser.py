"""demoparser2 execution boundary.

Only this module touches the parser library. Its job is narrow on purpose:

1. run demoparser2 0.42.0 and collect RAW material (header + event tables),
   preserving unreadable streams as unknown instead of empty;
2. enrich event rows with parser-native round/timing context when available;
3. remove warmup observations before they can enter the APP contract;
4. translate parser failures into semantic demo failures and let unrelated
   failures bubble to app.py as PARSER_ERROR;
5. hand the resulting raw material to adapter.py, which owns the final
   RawParserOutput translation.

The parser model and APP contract remain separate. No score/team identity is
invented, and every timing value comes from parser-native evidence or a real
header tickrate. Unknown is never converted to zero/false.

Known limitation: parse runs in a worker thread via asyncio.to_thread. A
PARSE_TIMEOUT frees the HTTP request but does not interrupt the native parser
call already in flight.
"""

from __future__ import annotations

from typing import Any

from adapter import build_raw_parser_output
from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError

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

_EVENT_TABLES = (
    "player_death",
    "player_hurt",
    "player_blind",
    "bomb_planted",
    "bomb_defused",
    "bomb_exploded",
)

# These are documented demoparser2 game-state properties and are used only as
# context. If a particular event stream cannot expose them, the parser falls
# back to the plain event stream rather than treating the whole demo as bad.
_EVENT_OTHER_PROPS = ("total_rounds_played", "is_warmup_period", "game_time")


def classify_parser_exception(exc: BaseException) -> BaseException:
    """Return a semantic demo error when there is positive evidence, else exc."""
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


def _parse_event_with_context(demo: Any, name: str) -> list[dict[str, Any]] | None:
    """Read one event stream with round/timing context, preserving unknown."""
    try:
        frame = demo.parse_event(name, [], list(_EVENT_OTHER_PROPS))
        return _records(frame)
    except Exception:
        try:
            frame = demo.parse_event(name)
            return _records(frame)
        except Exception:
            return None


def _contextualize_rows(rows: list[dict[str, Any]], *, drop_warmup: bool = True) -> list[dict[str, Any]]:
    """Add canonical-friendly round context without inventing any values."""
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        warmup = row.get("is_warmup_period")
        if drop_warmup and warmup is True:
            continue
        enriched = dict(row)
        round_number = enriched.get("total_rounds_played")
        if isinstance(round_number, bool):
            round_number = None
        if isinstance(round_number, (int, float)) and int(round_number) > 0:
            enriched["round"] = int(round_number)
        game_time = enriched.get("game_time")
        if isinstance(game_time, bool):
            game_time = None
        if isinstance(game_time, (int, float)) and game_time >= 0:
            enriched["time_seconds"] = float(game_time)
        out.append(enriched)
    return out


def _postprocess_contract(raw: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    """Final semantic guard between adapter output and the HTTP contract.

    This guard fixes only deterministic semantics that the current APP contract
    requires: parser team-number tokens are sides, real header tickrate is used
    for timing/duration, and event game_time/tick timing is preserved. It never
    creates team identity or score.
    """
    header = raw.get("header") or {}
    contract_header = output.get("header") or {}

    tickrate = header.get("playback_ticks_per_second")
    if isinstance(tickrate, (int, float)) and not isinstance(tickrate, bool) and tickrate > 0:
        contract_header["tickrate"] = float(tickrate)
        total_ticks = header.get("playback_ticks")
        if isinstance(total_ticks, (int, float)) and not isinstance(total_ticks, bool) and total_ticks >= 0:
            contract_header["duration_seconds"] = round(float(total_ticks) / float(tickrate), 3)
    output["header"] = contract_header

    # demoparser2 parse_player_info exposes team_number 2/3. That is side
    # evidence, not team identity. Never leak CT/TERRORIST into RawParserPlayer.team.
    for player in output.get("players") or []:
        team = player.get("team")
        if team == "CT":
            player["side"] = "CT"
            player.pop("team", None)
        elif team == "TERRORIST":
            player["side"] = "T"
            player.pop("team", None)

    # Build a real event timing index from the raw parser rows. Prefer native
    # game_time; otherwise derive from the verified header tickrate.
    timing_index: dict[tuple[str, int, int], float] = {}
    for name in _EVENT_TABLES + ("round_start", "round_end"):
        for row in raw.get(name) or []:
            tick = row.get("tick")
            round_number = row.get("round") or row.get("total_rounds_played")
            if not isinstance(tick, int) or not isinstance(round_number, int) or round_number <= 0:
                continue
            game_time = row.get("time_seconds") or row.get("game_time")
            if isinstance(game_time, (int, float)) and not isinstance(game_time, bool) and game_time >= 0:
                timing_index[(name, round_number, tick)] = float(game_time)

    for event in output.get("events") or []:
        event_type = event.get("type")
        round_number = event.get("round")
        tick = event.get("tick")
        if not isinstance(round_number, int) or not isinstance(tick, int):
            continue
        source_name = event_type
        native_name = "round_start" if source_name == "round_start" else "round_end" if source_name == "round_end" else source_name
        native_time = timing_index.get((native_name, round_number, tick))
        if native_time is not None:
            event["time_seconds"] = native_time
        elif isinstance(contract_header.get("tickrate"), (int, float)) and contract_header["tickrate"] > 0:
            event["time_seconds"] = round(tick / float(contract_header["tickrate"]), 6)

    # A round_end winner token CT/TERRORIST is side evidence, not team identity.
    for round_row in output.get("rounds") or []:
        winner_team = round_row.get("winner_team")
        if winner_team == "CT":
            round_row["winner_side"] = "CT"
            round_row.pop("winner_team", None)
        elif winner_team == "TERRORIST":
            round_row["winner_side"] = "T"
            round_row.pop("winner_team", None)

    return output


def extract_raw_material(demo: Any) -> dict[str, Any]:
    """Collect demoparser2 material while preserving unavailable streams."""
    warnings: list[str] = []
    raw: dict[str, Any] = {"warnings": warnings}

    raw["header"] = dict(demo.parse_header() or {})

    for name in ("round_start", "round_end"):
        rows = _parse_event_with_context(demo, name)
        if rows is None:
            raw[f"{name.replace('_', '_')}s"] = []
            warnings.append(f"{name}_unavailable")
        else:
            raw[f"{name.replace('_', '_')}s"] = _contextualize_rows(rows)

    # The adapter expects plural round_starts/round_ends, while the event names
    # are singular. Keep explicit assignments to avoid accidental key drift.
    if "round_starts" not in raw:
        raw["round_starts"] = []
    if "round_ends" not in raw:
        raw["round_ends"] = []

    for name in _EVENT_TABLES:
        rows = _parse_event_with_context(demo, name)
        if rows is None:
            raw[name] = None
            warnings.append(f"{name}_unavailable")
        else:
            raw[name] = _contextualize_rows(rows)

    try:
        raw["players"] = _records(demo.parse_player_info())
    except Exception:  # noqa: BLE001 - optional section
        raw["players"] = []
        warnings.append("player_info_unavailable")

    return raw


def parse_demo_file(path: str) -> dict[str, Any]:
    """Parse a `.dem` file into the `RawParserOutput` contract."""
    try:
        from demoparser2 import DemoParser  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - environment specific
        raise RuntimeError("demoparser2 is not available in this build") from exc

    try:
        raw = extract_raw_material(DemoParser(path))
    except BaseException as exc:  # noqa: BLE001 - classified below
        raise classify_parser_exception(exc) from exc

    output = build_raw_parser_output(raw)
    return _postprocess_contract(raw, output)
