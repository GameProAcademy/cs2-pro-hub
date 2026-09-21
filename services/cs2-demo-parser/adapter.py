"""demoparser2 -> RawParserOutput adapter (contract_version 1).

This module is the ONLY place that knows both models:

    demoparser2 0.42.0 raw model  (pandas records / header dict)
        |
        v
    adapter (this file)
        |
        v
    APP contract `RawParserOutput` (src/lib/pipeline/types.ts)

Hard rules encoded here:

* NULL/absent means "no evidence". Unknown is NEVER 0, NEVER False, NEVER "".
* No field is invented: every produced value comes from a real demoparser2
  column, or from a deterministic derivation of real values.
* Tickrate is never assumed. Without a real tickrate no duration is derived.
* Sides (CT/T) are never guessed from team names.
* Events are FLAT (`{"type": ..., "round": ..., ...}`) — never `{"type", "data"}`.
* Every event needs a deterministic round; events that cannot be placed are
  dropped and counted in an explicit warning.
* Output ordering is deterministic (players by steam_id, rounds by number,
  events by round/tick/type/source index).
"""

from __future__ import annotations

import math
from typing import Any, Iterable, Sequence

Record = dict[str, Any]

#: Event types this worker maps into the contract. Aliased by the APP normalizer.
SUPPORTED_EVENTS: tuple[str, ...] = (
    "player_death",
    "player_hurt",
    "player_blind",
    "bomb_planted",
    "bomb_defused",
    "bomb_exploded",
    "round_start",
    "round_end",
    "weapon_fire",
    "weapon_fire_on_empty",
    "weapon_reload",
    "weapon_zoom",
    "weapon_zoom_rifle",
    "grenade_thrown",
    "hegrenade_detonate",
    "flashbang_detonate",
    "smokegrenade_detonate",
    "molotov_detonate",
    "inferno_expire",
    "smokegrenade_expired",
    "decoy_detonate",
    "item_purchase",
    "item_pickup",
    "item_remove",
    "bomb_beginplant",
    "bomb_begindefuse",
    "bomb_beep",
    "player_spawned",
    "player_team",
)

#: demoparser2 `team_number` is a real, observable value. 2 = T, 3 = CT.
#: It describes the team slot at parse time, NOT a per-round side, so it is
#: mapped to `team` only — `side` is left absent (see README).
_TEAM_NUMBERS = {2: "TERRORIST", 3: "CT"}

_SIDE_TOKENS = {
    "ct": "CT",
    "counter-terrorist": "CT",
    "counterterrorist": "CT",
    "3": "CT",
    "t": "T",
    "terrorist": "T",
    "tr": "T",
    "2": "T",
}


# --------------------------------------------------------------------------- #
# primitives
# --------------------------------------------------------------------------- #
def _num(value: Any) -> float | int | None:
    """Real finite number or None. Booleans are not numbers here."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return value
    return None


def _int(value: Any) -> int | None:
    number = _num(value)
    if number is None:
        return None
    if isinstance(number, float) and not float(number).is_integer():
        return None
    return int(number)


def _bool(value: Any) -> bool | None:
    """Only a real boolean (or 0/1 integer flag) is evidence."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    return None


def _text(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    text = str(value).strip()
    return text or None


def _pick(row: Record, *keys: str) -> Any:
    for key in keys:
        if key in row:
            value = row[key]
            if value is not None and value == value and value != "":  # noqa: PLR0124
                return value
    return None


def _side(value: Any) -> str | None:
    text = _text(value)
    if text is None:
        return None
    return _SIDE_TOKENS.get(text.lower())


def is_valid_steam_id(value: Any) -> bool:
    text = _text(value)
    if text is None or not text.isdigit() or len(text) != 17:
        return False
    return text.startswith("7656119")


def _steam_id(value: Any) -> str | None:
    text = _text(value)
    return text if text is not None and is_valid_steam_id(text) else None


def _position(row: Record, prefix: str) -> dict[str, float] | None:
    """Position from real coordinate columns only. Partial data is not padded."""
    out: dict[str, float] = {}
    for axis in ("X", "Y", "Z"):
        value = _num(_pick(row, f"{prefix}_{axis}", f"{prefix}_{axis.lower()}"))
        if value is not None:
            out[axis.lower()] = float(value)
    return out or None


# --------------------------------------------------------------------------- #
# header
# --------------------------------------------------------------------------- #
def normalize_header(raw: Record, warnings: list[str]) -> Record:
    """demoparser2 header dict -> contract header.

    Only `map` and `game_version` are guaranteed in the demoparser2 header.
    Tickrate is used only when the parser provides it; duration, match date,
    score and teams are absent instead of guessed.
    """
    source = {str(k): v for k, v in dict(raw or {}).items()}
    tickrate = _num(_pick(source, "tickrate", "tick_rate"))

    header: Record = {
        "map": _text(_pick(source, "map_name", "map")),
        "game_version": _text(
            _pick(source, "demo_version_name", "game_version", "client_name", "server_name")
        ),
        "tickrate": float(tickrate) if tickrate is not None else None,
        "duration_seconds": None,
        "match_date": None,
        "score": {},
        "teams": {},
    }
    if header["map"] is None:
        warnings.append("map_unavailable")
    if header["tickrate"] is None:
        warnings.append("tickrate_unavailable: round durations not derived")
    return header


# --------------------------------------------------------------------------- #
# players
# --------------------------------------------------------------------------- #
def normalize_players(rows: Iterable[Record], warnings: list[str]) -> list[Record]:
    """demoparser2 `parse_player_info()` -> RawParserPlayer[].

    `steamid` -> `steam_id`, `team_number` -> `team`. Invalid Steam IDs are
    dropped (they are bots/spectator slots); duplicates collapse into the first
    occurrence enriched with any later non-empty field.
    """
    by_id: dict[str, Record] = {}
    invalid = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        steam_id = _steam_id(_pick(row, "steamid", "steam_id", "user_steamid"))
        if steam_id is None:
            invalid += 1
            continue
        player = by_id.setdefault(steam_id, {"steam_id": steam_id})
        name = _text(_pick(row, "name", "player_name", "user_name"))
        if name is not None and player.get("name") is None:
            player["name"] = name
        team = _TEAM_NUMBERS.get(_int(_pick(row, "team_number", "team")) or -1)
        if team is None:
            team = _text(_pick(row, "team_name", "team_clan_name"))
        if team is not None and player.get("team") is None:
            player["team"] = team
    if invalid:
        warnings.append(f"{invalid} player entries had no valid steam id and were omitted")
    return [by_id[key] for key in sorted(by_id)]


# --------------------------------------------------------------------------- #
# rounds
# --------------------------------------------------------------------------- #
def _sorted_ticks(rows: Iterable[Record]) -> list[int]:
    ticks = [tick for tick in (_int(_pick(row, "tick")) for row in rows) if tick is not None]
    return sorted(set(ticks))


def build_round_intervals(
    round_starts: Sequence[Record],
    round_ends: Sequence[Record],
) -> list[tuple[int, int | None, int | None]]:
    """Pair observed round starts with the first valid later round end.

    demoparser2 can expose a lifecycle round_end at tick 1 before the first
    played round_start. That row is not the end of round 1. The old
    cursor-by-end algorithm consumed it and shifted every subsequent boundary,
    producing impossible intervals such as end_tick < start_tick.

    The pairing rule is deliberately conservative:
    * starts are the authoritative round sequence when present;
    * an end before the first start is orphan lifecycle evidence and is ignored;
    * each start may consume only an end at/after that start and before the next
      observed start;
    * an end that cannot be paired is left unconsumed rather than shifted;
    * when starts are absent, ends still form evidence-only rounds with unknown starts.
    """
    starts = _sorted_ticks(round_starts)
    ends = _sorted_ticks(round_ends)

    if not starts:
        return [(index, None, end) for index, end in enumerate(ends, start=1)]

    intervals: list[tuple[int, int | None, int | None]] = []
    cursor = 0
    for index, start in enumerate(starts, start=1):
        next_start = starts[index] if index < len(starts) else None

        while cursor < len(ends) and ends[cursor] < start:
            cursor += 1

        end: int | None = None
        if cursor < len(ends):
            candidate = ends[cursor]
            if next_start is None or candidate < next_start:
                end = candidate
                cursor += 1

        intervals.append((index, start, end))

    return intervals

def resolve_event_round(
    tick: int | None,
    intervals: Sequence[tuple[int, int | None, int | None]],
) -> int | None:
    """Map a tick to a round only when its observed window contains the tick.

    Known gaps between a round end and the next round start are intentionally
    not assigned to either round. This prevents lifecycle/intermission events
    from being attached to the next round merely because it is next.
    """
    if tick is None or not intervals:
        return None

    for index, (number, start, end) in enumerate(intervals):
        next_start = intervals[index + 1][1] if index + 1 < len(intervals) else None

        if end is not None:
            if start is not None and start <= tick <= end:
                return number
            if start is None and tick <= end and (index == 0 or tick > (intervals[index - 1][2] or -1)):
                return number
            continue

        if start is not None and tick >= start and (next_start is None or tick < next_start):
            return number

    return None

def normalize_rounds(
    round_starts: Sequence[Record],
    round_ends: Sequence[Record],
    *,
    bombs: dict[str, Sequence[Record] | None],
    tickrate: float | None,
    warnings: list[str],
) -> list[Record]:
    """-> RawParserRound[]: one entry per observed round, ordered by number.

    `bombs` maps `planted|defused|exploded` to the parsed rows, or None when that
    event stream could not be read. A read stream with no row inside a round is
    negative evidence (False); an unreadable stream stays absent (None).
    """
    intervals = build_round_intervals(round_starts, round_ends)
    if not intervals:
        return []

    ends_by_tick: dict[int, Record] = {}
    for row in round_ends:
        tick = _int(_pick(row, "tick"))
        if tick is not None and tick not in ends_by_tick:
            ends_by_tick[tick] = row

    bomb_rounds: dict[str, set[int] | None] = {}
    for key, rows in bombs.items():
        if rows is None:
            bomb_rounds[key] = None
            continue
        hits: set[int] = set()
        for row in rows:
            number = resolve_event_round(_int(_pick(row, "tick")), intervals)
            if number is not None:
                hits.add(number)
        bomb_rounds[key] = hits

    rounds: list[Record] = []
    for number, start, end in intervals:
        entry: Record = {"number": number}
        if start is not None:
            entry["start_tick"] = start
        if end is not None:
            entry["end_tick"] = end
        if start is not None and end is not None and end >= start and tickrate:
            entry["duration_seconds"] = round((end - start) / tickrate, 3)

        source = ends_by_tick.get(end) if end is not None else None
        if source is not None:
            side = _side(_pick(source, "winner", "winner_side"))
            if side is not None:
                entry["winner_side"] = side
            team = _text(_pick(source, "winner_team", "winner_clan_name"))
            if team is not None:
                entry["winner_team"] = team

        for key, field in (
            ("planted", "bomb_planted"),
            ("defused", "bomb_defused"),
            ("exploded", "bomb_exploded"),
        ):
            hits = bomb_rounds.get(key)
            if hits is not None:
                entry[field] = number in hits
        rounds.append(entry)

    # Economy is not exposed by demoparser2 event tables; absent, never zeroed.
    warnings.append("economy_unavailable: money_start/money_end/equipment_value not provided")
    return rounds


# --------------------------------------------------------------------------- #
# events
# --------------------------------------------------------------------------- #
def _event_fields(name: str, row: Record) -> Record:
    out: Record = {}

    def put(key: str, value: Any) -> None:
        if value is not None:
            out[key] = value

    if name == "player_death":
        put("attacker", _steam_id(_pick(row, "attacker_steamid")))
        put("victim", _steam_id(_pick(row, "user_steamid", "victim_steamid")))
        put("assister", _steam_id(_pick(row, "assister_steamid")))
        put("weapon", _text(_pick(row, "weapon")))
        put("headshot", _bool(_pick(row, "headshot")))
        put("noscope", _bool(_pick(row, "noscope")))
        put("blind", _bool(_pick(row, "attackerblind")))
        penetration = _int(_pick(row, "penetrated"))
        if penetration is not None:
            out["penetration"] = penetration
            out["wallbang"] = penetration > 0
        put("distance", _num(_pick(row, "distance")))
        put("position", _position(row, "attacker"))
        put("victim_position", _position(row, "user"))
    elif name == "player_hurt":
        put("attacker", _steam_id(_pick(row, "attacker_steamid")))
        put("victim", _steam_id(_pick(row, "user_steamid")))
        put("weapon", _text(_pick(row, "weapon")))
        put("damage", _num(_pick(row, "dmg_health")))
        put("armor_damage", _num(_pick(row, "dmg_armor")))
    elif name == "player_blind":
        put("attacker", _steam_id(_pick(row, "attacker_steamid")))
        put("victim", _steam_id(_pick(row, "user_steamid")))
        put("flash_duration", _num(_pick(row, "blind_duration")))
    elif name in ("bomb_planted", "bomb_defused", "bomb_exploded"):
        put("attacker", _steam_id(_pick(row, "user_steamid")))
    return out


def normalize_events(
    grouped: Sequence[tuple[str, Sequence[Record]]],
    intervals: Sequence[tuple[int, int | None, int | None]],
    warnings: list[str],
) -> list[Record]:
    """Flatten every raw event row into the contract shape, with a real round."""
    pairs: list[tuple[Record, int]] = []
    dropped = 0
    order = 0
    for name, rows in grouped:
        for row in rows:
            order += 1
            if not isinstance(row, dict):
                dropped += 1
                continue
            tick = _int(_pick(row, "tick"))
            explicit_number = _int(_pick(row, "round", "round_number"))
            number = explicit_number if explicit_number is not None and explicit_number > 0 else None

            # An explicit parser round is evidence only when structurally
            # consistent with the observed interval. Never let a round number
            # override an impossible tick/boundary relationship.
            if number is not None:
                interval = next((item for item in intervals if item[0] == number), None)
                if interval is None or (tick is not None and resolve_event_round(tick, [interval]) != number):
                    dropped += 1
                    continue

            if number is None:
                number = resolve_event_round(tick, intervals)
            if number is None:
                dropped += 1
                continue
            event: Record = {"type": name, "round": number}
            if tick is not None:
                event["tick"] = tick
            event.update(_event_fields(name, row))
            pairs.append((event, order))

    if dropped:
        warnings.append(
            f"{dropped} events could not be assigned to a deterministic round and were omitted."
        )

    pairs.sort(
        key=lambda item: (item[0]["round"], item[0].get("tick", 0), item[0]["type"], item[1])
    )
    return [event for event, _ in pairs]



# --------------------------------------------------------------------------- #
# full output
# --------------------------------------------------------------------------- #
def build_raw_parser_output(raw: Record) -> Record:
    """Assemble the contract sections from raw demoparser2 material.

    `raw` carries the untouched parser material:
        header, players, round_starts, round_ends, and the event tables
        (a None table means "this stream could not be read").
    """
    warnings: list[str] = list(raw.get("warnings") or [])
    header = normalize_header(raw.get("header") or {}, warnings)
    players = normalize_players(raw.get("players") or [], warnings)

    round_starts = list(raw.get("round_starts") or [])
    round_ends = list(raw.get("round_ends") or [])
    if not round_ends:
        warnings.append("round_end_unavailable")

    tables: dict[str, Sequence[Record] | None] = {
        name: raw.get(name) for name in SUPPORTED_EVENTS if name in raw
    }
    rounds = normalize_rounds(
        round_starts,
        round_ends,
        bombs={
            "planted": tables.get("bomb_planted"),
            "defused": tables.get("bomb_defused"),
            "exploded": tables.get("bomb_exploded"),
        },
        tickrate=header["tickrate"],
        warnings=warnings,
    )
    intervals = build_round_intervals(round_starts, round_ends)

    grouped: list[tuple[str, Sequence[Record]]] = []
    for name in SUPPORTED_EVENTS:
        rows = tables.get(name)
        if name == "round_start":
            rows = round_starts
        elif name == "round_end":
            rows = round_ends
        if rows:
            grouped.append((name, list(rows)))

    events = normalize_events(grouped, intervals, warnings)

    return {
        "header": header,
        "players": players,
        "rounds": rounds,
        "events": events,
        "warnings": warnings,
    }
