"""demoparser2 execution boundary.

Only this module touches the parser library. Its job is narrow on purpose:

1. run demoparser2 0.42.0 and collect RAW material (header + event tables),
   preserving unreadable streams as unknown instead of empty;
2. enrich event rows with parser-native round/timing context when available;
3. remove warmup observations before they can enter the APP contract;
4. reject structurally truncated demos before any partial observations can be
   returned;
5. translate parser failures into semantic demo failures and let unrelated
   failures bubble to app.py as PARSER_ERROR;
6. hand the resulting raw material to adapter.py, which owns the final
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
from demo_integrity import validate_demo_structure
from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError
from raw_evidence import (
    EVENT_CANDIDATES,
    PLAYER_PROPERTIES,
    TICK_SAMPLE_LIMIT,
    build_gates,
    build_manifest,
    event_coverage,
    field_coverage,
    mapping_inventory,
    raw_events,
    safe_error,
)

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

_EVENT_TABLES = tuple(name for name in EVENT_CANDIDATES if name not in ("round_start", "round_end"))

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


def _parse_event_with_context(
    demo: Any, name: str
) -> tuple[list[dict[str, Any]] | None, BaseException | None]:
    """Read one event stream and preserve its final parser failure."""
    try:
        frame = demo.parse_event(name, [], list(_EVENT_OTHER_PROPS))
        return _records(frame), None
    except Exception:
        try:
            frame = demo.parse_event(name)
            return _records(frame), None
        except Exception as exc:
            return None, exc


def _available_events(demo: Any) -> tuple[set[str], BaseException | None]:
    method = getattr(demo, "list_game_events", None)
    if not callable(method):
        return set(EVENT_CANDIDATES), AttributeError("list_game_events is unavailable")
    try:
        return {str(name) for name in method()}, None
    except BaseException as exc:  # noqa: BLE001 - recorded as evidence
        return set(EVENT_CANDIDATES), exc


def _parse_ticks(
    demo: Any, sample_ticks: list[int]
) -> tuple[list[dict[str, Any]], BaseException | None]:
    method = getattr(demo, "parse_ticks", None)
    if not callable(method):
        return [], AttributeError("parse_ticks is unavailable")
    try:
        # The capability is intentionally sampled at deterministic round/event
        # ticks. Asking demoparser2 for every tick would produce an unbounded
        # response before the APP can enforce its payload ceiling.
        if not sample_ticks:
            return [], ValueError("no deterministic event ticks available for sampling")
        frame = method(list(PLAYER_PROPERTIES), ticks=sample_ticks)
        rows = _records(frame)
        if len(rows) <= TICK_SAMPLE_LIMIT:
            return rows, None
        step = max(1, len(rows) // TICK_SAMPLE_LIMIT)
        return rows[::step][:TICK_SAMPLE_LIMIT], None
    except BaseException as exc:  # noqa: BLE001 - recorded as evidence
        return [], exc


def _parse_grenades(demo: Any) -> tuple[list[dict[str, Any]], BaseException | None]:
    method = getattr(demo, "parse_grenades", None)
    if not callable(method):
        return [], AttributeError("parse_grenades is unavailable")
    try:
        return _records(method()), None
    except BaseException as exc:  # noqa: BLE001 - recorded as evidence
        return [], exc


def _steam_id(row: dict[str, Any]) -> str | None:
    value = row.get("player_steamid", row.get("steamid"))
    if isinstance(value, int) and value > 0:
        return str(value)
    if isinstance(value, str) and value.isdigit() and int(value) > 0:
        return value
    return None


def _side_from_tick(row: dict[str, Any]) -> str | None:
    value = row.get("team_num", row.get("team_number"))
    if value in (2, "2", "T", "TERRORIST"):
        return "T"
    if value in (3, "3", "CT"):
        return "CT"
    return None


def _finite_number(value: Any) -> int | float | None:
    import math
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(float(value)) else None


def derive_round_streams_from_tick_evidence(raw: dict[str, Any]) -> None:
    """Recover round boundaries only from parser-native game-state evidence.

    Some CS2 demos do not advertise ``round_start``/``round_end`` events even
    though ``parse_ticks`` returns ``total_rounds_played`` and
    ``round_start_time``. The latter pair deterministically identifies the round
    start tick at the verified header tickrate. End ticks remain unknown unless
    observed; no winner, score, team identity, or false boundary is invented.
    """
    if raw.get("round_starts") or raw.get("round_ends"):
        return
    header = raw.get("header") or {}
    tickrate = _finite_number(header.get("playback_ticks_per_second"))
    if tickrate is None or tickrate <= 0:
        return

    starts: dict[int, dict[str, Any]] = {}
    for row in raw.get("tick_rows") or []:
        round_index = row.get("total_rounds_played")
        tick = row.get("tick")
        game_time = _finite_number(row.get("game_time"))
        round_start_time = _finite_number(row.get("round_start_time"))
        if (
            isinstance(round_index, bool)
            or not isinstance(round_index, (int, float))
            or not float(round_index).is_integer()
            or round_index < 0
            or not isinstance(tick, int)
            or game_time is None
            or round_start_time is None
            or game_time < round_start_time
        ):
            continue
        start_tick = round(float(tick) - (float(game_time) - float(round_start_time)) * tickrate)
        if start_tick < 0:
            continue
        number = int(round_index) + 1
        previous = starts.get(number)
        if previous is None or start_tick < previous["tick"]:
            starts[number] = {
                "tick": start_tick,
                "round": number,
                "derived_from": "game_state.round_start_time",
            }

    if not starts:
        return
    derived = [starts[number] for number in sorted(starts)]
    raw["round_starts"] = derived
    raw["round_rows"] = [{"number": row["round"], "start_tick": row["tick"]} for row in derived]
    raw["warnings"].append("round_boundaries_derived_from_game_state: end ticks and winners unavailable")


def enrich_rounds_from_tick_evidence(raw: dict[str, Any], output: dict[str, Any]) -> None:
    """Project only observed start/end snapshots into APP round evidence."""
    rows_by_tick: dict[int, list[dict[str, Any]]] = {}
    for row in raw.get("tick_rows") or []:
        tick = row.get("tick")
        if isinstance(tick, int):
            rows_by_tick.setdefault(tick, []).append(row)

    for round_row in output.get("rounds") or []:
        start_tick = round_row.get("start_tick")
        end_tick = round_row.get("end_tick")
        start_rows = rows_by_tick.get(start_tick, []) if isinstance(start_tick, int) else []
        end_rows = rows_by_tick.get(end_tick, []) if isinstance(end_tick, int) else []
        sides: dict[str, str] = {}
        money_start: dict[str, int | float] = {}
        money_end: dict[str, int | float] = {}
        equipment_value: dict[str, int | float] = {}
        for row in start_rows:
            steam_id = _steam_id(row)
            if steam_id is None:
                continue
            side = _side_from_tick(row)
            if side is not None:
                sides[steam_id] = side
            balance = _finite_number(row.get("start_balance", row.get("balance")))
            equipment = _finite_number(
                row.get("round_start_equip_value", row.get("current_equip_value"))
            )
            if balance is not None:
                money_start[steam_id] = balance
            if equipment is not None:
                equipment_value[steam_id] = equipment
        for row in end_rows:
            steam_id = _steam_id(row)
            if steam_id is None:
                continue
            balance = _finite_number(row.get("balance"))
            if balance is not None:
                money_end[steam_id] = balance
        if sides:
            round_row["sides"] = dict(sorted(sides.items()))
        if money_start:
            round_row["money_start"] = dict(sorted(money_start.items()))
        if money_end:
            round_row["money_end"] = dict(sorted(money_end.items()))
        if equipment_value:
            round_row["equipment_value"] = dict(sorted(equipment_value.items()))


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

    inventory, inventory_error = _available_events(demo)
    raw["event_inventory_error"] = inventory_error
    raw["event_inventory"] = sorted(inventory)
    raw["event_tables"] = {}
    raw["event_errors"] = {}

    # The complete inventory is retained for audit, but only the reviewed,
    # bounded high-value allow-list is parsed.
    # Every event advertised by this concrete parser/demo is attempted. The
    # reviewed list remains useful for mapping, but never limits RAW capture.
    event_names = sorted(inventory | set(EVENT_CANDIDATES))
    for name in event_names:
        if name not in inventory:
            raw["event_tables"][name] = None
            continue
        rows, parse_error = _parse_event_with_context(demo, name)
        if rows is None:
            raw["event_tables"][name] = None
            raw["event_errors"][name] = parse_error or RuntimeError(f"{name} could not be parsed")
            warnings.append(f"{name}_unavailable")
        else:
            raw["event_tables"][name] = _contextualize_rows(rows)

    raw["round_starts"] = raw["event_tables"].get("round_start") or []
    raw["round_ends"] = raw["event_tables"].get("round_end") or []

    # The adapter expects plural round_starts/round_ends, while the event names
    # are singular. Keep explicit assignments to avoid accidental key drift.
    if "round_starts" not in raw:
        raw["round_starts"] = []
    if "round_ends" not in raw:
        raw["round_ends"] = []

    for name in _EVENT_TABLES:
        raw[name] = raw["event_tables"].get(name)

    try:
        raw["players"] = _records(demo.parse_player_info())
        raw["player_info_error"] = None
    except Exception as exc:  # noqa: BLE001 - preserved as forensic evidence
        raw["players"] = []
        raw["player_info_error"] = exc
        warnings.append("player_info_unavailable")

    sample_ticks = sorted(
        {
            tick
            for name in raw["event_tables"]
            for row in (raw["event_tables"].get(name) or [])
            for tick in [row.get("tick")]
            if isinstance(tick, int)
        }
    )
    tick_rows, tick_error = _parse_ticks(demo, sample_ticks)
    grenade_rows, grenade_error = _parse_grenades(demo)
    raw["tick_rows"] = tick_rows
    raw["tick_error"] = tick_error
    raw["grenade_rows"] = grenade_rows
    raw["grenade_error"] = grenade_error
    derive_round_streams_from_tick_evidence(raw)
    return raw


def build_raw_evidence(raw: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    coverage = []
    inventory_error = raw.get("event_inventory_error")
    for name in sorted(raw["event_tables"]):
        rows = raw["event_tables"].get(name)
        available = name in set(raw.get("event_inventory") or [])
        coverage.append(event_coverage(
            name, available, rows, raw["event_errors"].get(name),
            api_available=inventory_error is None or rows is not None,
        ))
    tick_rows = raw.get("tick_rows") or []
    grenade_rows = raw.get("grenade_rows") or []
    tick_error = raw.get("tick_error")
    grenade_error = raw.get("grenade_error")
    tick_properties = sorted({key for row in tick_rows for key in row}) or list(PLAYER_PROPERTIES)
    tick_coverage = field_coverage(tick_rows, tick_properties)
    if tick_error:
        kind, message = safe_error(tick_error)
        tick_coverage.append({"property": "__capability__", "available": False, "rows": 0,
                              "null_percent": None, "min": None, "max": None, "sample": None,
                              "success": False, "error": f"{kind}: {message}"})
    grenade_properties = sorted({key for row in grenade_rows for key in row})
    grenade_coverage = field_coverage(grenade_rows, grenade_properties or ["entity_id", "grenade_type", "steamid", "name", "tick", "X", "Y", "Z"])
    if grenade_error:
        kind, message = safe_error(grenade_error)
        grenade_coverage.append({"property": "__capability__", "available": False, "rows": 0,
                                 "null_percent": None, "min": None, "max": None, "sample": None,
                                 "success": False, "error": f"{kind}: {message}"})
    player_rows = raw.get("players") or []
    player_properties = sorted({key for row in player_rows for key in row})
    player_coverage = field_coverage(player_rows, player_properties)
    player_info_error = raw.get("player_info_error")
    if player_info_error:
        kind, message = safe_error(player_info_error)
        player_coverage.append({"property": "__capability__", "available": False, "rows": 0,
                                "null_percent": None, "min": None, "max": None, "sample": None,
                                "success": False, "error": f"{kind}: {message}"})
    economy_names = {"balance", "start_balance", "total_cash_spent", "cash_spent_this_round",
                     "round_start_equip_value", "current_equip_value", "weapon_purchases_this_round",
                     "weapon_purchases_this_match"}
    economy_coverage = [item for item in tick_coverage if item["property"] in economy_names]
    evidence = {
        "evidence_version": 1,
        "manifest": build_manifest(raw, output),
        "event_coverage": sorted(coverage, key=lambda item: item["event_name"]),
        "raw_events": raw_events(raw["event_tables"]),
        "raw_player_info": player_rows,
        "player_coverage": player_coverage,
        "tick_coverage": tick_coverage,
        "tick_samples": tick_rows,
        "grenade_coverage": grenade_coverage,
        "grenade_samples": grenade_rows,
        "round_evidence": output.get("rounds") or [],
        "economy_coverage": economy_coverage,
        "field_mappings": mapping_inventory(raw),
        "gates": [],
    }
    failed_capability = any(item["capability_state"] in ("PARSE_FAILED", "API_UNAVAILABLE") for item in coverage)
    failed_capability = failed_capability or tick_error is not None or grenade_error is not None or player_info_error is not None
    evidence["manifest"]["partial_parse"] = failed_capability
    penalties = 0.0
    penalties += 0.4 if not output.get("players") else 0.0
    penalties += 0.4 if not output.get("rounds") else 0.0
    penalties += 0.2 if failed_capability else 0.0
    penalties += 0.1 if not economy_coverage or not any(item["available"] for item in economy_coverage) else 0.0
    evidence["manifest"]["extraction_confidence"] = round(max(0.0, 1.0 - penalties), 3)
    evidence["gates"] = build_gates(evidence)
    return evidence


def parse_demo_file(path: str) -> dict[str, Any]:
    """Parse a `.dem` file into the `RawParserOutput` contract."""
    # IMPORTANT: run before constructing DemoParser. demoparser2's outer frame
    # loop deliberately skips a frame whose declared payload runs beyond EOF;
    # without this gate a truncated prefix could look like a successful match.
    validate_demo_structure(path)

    try:
        from demoparser2 import DemoParser  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - environment specific
        raise RuntimeError("demoparser2 is not available in this build") from exc

    try:
        raw = extract_raw_material(DemoParser(path))
    except BaseException as exc:  # noqa: BLE001 - classified below
        raise classify_parser_exception(exc) from exc

    output = _postprocess_contract(raw, build_raw_parser_output(raw))
    enrich_rounds_from_tick_evidence(raw, output)
    if any(
        round_row.get("money_start")
        or round_row.get("money_end")
        or round_row.get("equipment_value")
        for round_row in output.get("rounds") or []
    ):
        output["warnings"] = [
            warning
            for warning in output.get("warnings") or []
            if not str(warning).startswith("economy_unavailable:")
        ]
    output["raw_evidence"] = build_raw_evidence(raw, output)
    return output
