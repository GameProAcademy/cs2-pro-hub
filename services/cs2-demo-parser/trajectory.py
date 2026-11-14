"""PM2 4.2.4 — `cs2.round-trajectory.v1`: sampled player positions per round for the 2D replay.

One bounded `parse_ticks` read of five entity properties (X, Y, Z, is_alive, team_num) at a fixed
tick step inside each round's live window (freeze end, else round start, to round end). It is
kept apart from the governed RAW evidence (like the PM6 C game-phase read), so the field catalog,
the field matrix and the mapping digest are unchanged.

Semantics (never guessed):
  * a sample is a real entity read at that tick; a player without a read at a sampled tick has
    ``None`` at that index (a gap), never an interpolated or zero position;
  * ``alive`` is the entity's ``is_alive`` at that tick (None when unread);
  * positions are rounded to whole world units (the radar is 1024 px over ~4000-5000 units) and
    must fit int16 (CS2 maps are within ±16384); anything else is a gap;
  * the step is in ticks (``step_ticks``); no tickrate is assumed here — the app converts ticks to
    seconds only through a proven tick/time relation;
  * only players on a side (team_num 2/3) are kept; a player seen on two sides in one round is
    dropped from that round (no guess);
  * a round whose window is unknown, inverted or longer than ``MAX_SAMPLES_PER_ROUND`` samples is
    reported as skipped with a reason, never truncated; once ``MAX_TOTAL_PLAYER_SAMPLES`` would be
    exceeded, the remaining rounds are skipped as ``LIMIT`` (the payload stays bounded).
"""
from __future__ import annotations

import base64
import math
import struct
from typing import Any, Callable

TRAJECTORY_SCHEMA = "cs2.round-trajectory.v1"
STEP_TICKS = 16
MAX_SAMPLES_PER_ROUND = 1_600
MAX_TOTAL_PLAYER_SAMPLES = 400_000
MAX_PLAYERS_PER_ROUND = 12
PROPERTIES = ("X", "Y", "Z", "is_alive", "team_num")
# Compact encoding (bounded HOT payload): positions as little-endian int16 triples in base64, the
# gap sentinel -32768 in all three; alive as one char per sample: "1" alive, "0" dead, "-" unread.
GAP = -32768
ENCODING = "xyz:int16le-base64;gap=-32768|alive:char(1/0/-)"


def encode_player(x: list[int | None], y: list[int | None], z: list[int | None],
                  alive: list[bool | None]) -> tuple[str, str]:
    packed = bytearray()
    for xi, yi, zi in zip(x, y, z):
        if xi is None or yi is None or zi is None:
            packed += struct.pack("<hhh", GAP, GAP, GAP)
        else:
            packed += struct.pack("<hhh", xi, yi, zi)
    flags = "".join("-" if a is None else ("1" if a else "0") for a in alive)
    return base64.b64encode(bytes(packed)).decode("ascii"), flags


def _int(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return int(round(number))


def _side(value: Any) -> str | None:
    if value in (2, "2"):
        return "T"
    if value in (3, "3"):
        return "CT"
    return None


def _steam_id(row: dict[str, Any]) -> str | None:
    value = row.get("steamid", row.get("player_steamid"))
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return str(value)
    if isinstance(value, str) and value.isdigit() and int(value) > 0:
        return value
    return None


def round_windows(rounds: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Live window and sample ticks of each round, plus the rounds skipped and why."""
    windows: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    total = 0
    for row in rounds:
        number = _int(row.get("number", row.get("round_number")))
        start = _int(row.get("freeze_end_tick"))
        if start is None:
            start = _int(row.get("start_tick"))
        end = _int(row.get("end_tick"))
        if number is None:
            continue
        if start is None or end is None or end < start:
            skipped.append({"round": number, "reason": "WINDOW_UNKNOWN"})
            continue
        count = (end - start) // STEP_TICKS + 1
        if count > MAX_SAMPLES_PER_ROUND:
            skipped.append({"round": number, "reason": "ROUND_TOO_LONG"})
            continue
        if total + count * 10 > MAX_TOTAL_PLAYER_SAMPLES:
            skipped.append({"round": number, "reason": "LIMIT"})
            continue
        total += count * 10
        windows.append({"round": number, "first_tick": start, "end_tick": end, "sample_count": count})
    return windows, skipped


def build_trajectories(rows: list[dict[str, Any]], windows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pure: entity rows at the sampled ticks → per-round, per-player sample arrays."""
    by_tick: dict[int, tuple[int, int]] = {}
    for w_index, w in enumerate(windows):
        for i in range(w["sample_count"]):
            by_tick[w["first_tick"] + i * STEP_TICKS] = (w_index, i)
    players: list[dict[str, dict[str, Any]]] = [{} for _ in windows]
    conflicts: list[set[str]] = [set() for _ in windows]
    for row in rows:
        tick = _int(row.get("tick"))
        if tick is None or tick not in by_tick:
            continue
        w_index, i = by_tick[tick]
        steam_id = _steam_id(row)
        side = _side(row.get("team_num"))
        if steam_id is None or side is None:
            continue
        count = windows[w_index]["sample_count"]
        entry = players[w_index].get(steam_id)
        if entry is None:
            entry = {"steam_id": steam_id, "side": side,
                     "x": [None] * count, "y": [None] * count, "z": [None] * count, "alive": [None] * count}
            players[w_index][steam_id] = entry
        elif entry["side"] != side:
            conflicts[w_index].add(steam_id)
            continue
        x, y, z = _int(row.get("X")), _int(row.get("Y")), _int(row.get("Z"))
        in_range = all(v is not None and GAP < v <= 32767 for v in (x, y, z))
        if in_range and not (x == 0 and y == 0 and z == 0):
            entry["x"][i], entry["y"][i], entry["z"][i] = x, y, z
        alive = row.get("is_alive")
        entry["alive"][i] = alive if isinstance(alive, bool) else None
    out: list[dict[str, Any]] = []
    for w_index, w in enumerate(windows):
        kept = []
        for sid, p in sorted(players[w_index].items()):
            if sid in conflicts[w_index]:
                continue
            xyz, alive = encode_player(p["x"], p["y"], p["z"], p["alive"])
            kept.append({"steam_id": sid, "side": p["side"], "xyz": xyz, "alive": alive})
        out.append({
            "round": w["round"],
            "first_tick": w["first_tick"],
            "end_tick": w["end_tick"],
            "step_ticks": STEP_TICKS,
            "sample_count": w["sample_count"],
            "players": kept[:MAX_PLAYERS_PER_ROUND],
            "dropped_players": len(conflicts[w_index]) + max(0, len(kept) - MAX_PLAYERS_PER_ROUND),
        })
    return out


def parse_round_trajectories(
    parse_ticks: Callable[..., Any] | None,
    rounds: list[dict[str, Any]],
    records: Callable[[Any], list[dict[str, Any]]],
    reraise: Callable[[BaseException], None] = lambda exc: None,
) -> dict[str, Any]:
    """One bounded read at all sample ticks. Failure is reported, never raised as a demo error."""
    windows, skipped = round_windows(rounds)
    base = {"schema": TRAJECTORY_SCHEMA, "encoding": ENCODING, "step_ticks": STEP_TICKS, "skipped": skipped}
    if not callable(parse_ticks):
        return {**base, "status": "UNAVAILABLE", "reason": "PARSE_TICKS_UNAVAILABLE", "rounds": []}
    if not windows:
        return {**base, "status": "UNAVAILABLE", "reason": "NO_ROUND_WINDOW", "rounds": []}
    ticks = sorted({w["first_tick"] + i * STEP_TICKS for w in windows for i in range(w["sample_count"])})
    try:
        rows = records(parse_ticks(list(PROPERTIES), ticks=ticks))
    except Exception as exc:  # noqa: BLE001 - absence is reported; replay shows UNAVAILABLE
        reraise(exc)  # resource exhaustion / cancellation is never a demo property
        return {**base, "status": "UNAVAILABLE", "reason": "READ_FAILED", "rounds": []}
    built = build_trajectories(rows, windows)
    status = "PARTIAL" if skipped else "COMPLETE"
    return {**base, "status": status, "reason": None, "rounds": built}
