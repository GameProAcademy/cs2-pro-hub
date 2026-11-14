"""PM2 4.2.4 — cs2.round-trajectory.v1: sampling windows, gaps, conflicts, encoding, limits."""
import base64
import struct

import pytest

import trajectory as T
from hot_payload import build_hot_payload


def _decode(xyz: str) -> list[tuple[int, int, int] | None]:
    raw = base64.b64decode(xyz)
    out = []
    for i in range(0, len(raw), 6):
        x, y, z = struct.unpack("<hhh", raw[i:i + 6])
        out.append(None if x == T.GAP else (x, y, z))
    return out


def _row(tick, sid, team, x=100.4, y=-200.6, z=10.0, alive=True):
    return {"tick": tick, "steamid": sid, "team_num": team, "X": x, "Y": y, "Z": z, "is_alive": alive}


def test_windows_start_at_freeze_end_and_skip_unknown_or_too_long():
    windows, skipped = T.round_windows([
        {"number": 1, "start_tick": 0, "freeze_end_tick": 64, "end_tick": 64 + 16 * 4},
        {"number": 2, "start_tick": 500, "end_tick": None},
        {"number": 3, "start_tick": 1000, "end_tick": 900},
        {"number": 4, "start_tick": 0, "end_tick": T.STEP_TICKS * (T.MAX_SAMPLES_PER_ROUND + 1)},
    ])
    assert windows == [{"round": 1, "first_tick": 64, "end_tick": 128, "sample_count": 5}]
    assert {s["round"]: s["reason"] for s in skipped} == {
        2: "WINDOW_UNKNOWN", 3: "WINDOW_UNKNOWN", 4: "ROUND_TOO_LONG"}


def test_total_limit_skips_whole_rounds_never_truncates():
    per_round = T.MAX_SAMPLES_PER_ROUND - 1
    rounds = [{"number": n, "start_tick": 0, "end_tick": T.STEP_TICKS * per_round} for n in range(1, 40)]
    windows, skipped = T.round_windows(rounds)
    assert all(w["sample_count"] == per_round + 1 for w in windows)
    assert skipped and all(s["reason"] == "LIMIT" for s in skipped)
    assert sum(w["sample_count"] for w in windows) * 10 <= T.MAX_TOTAL_PLAYER_SAMPLES


def test_build_keeps_gaps_rounds_and_drops_side_conflicts():
    windows = [{"round": 7, "first_tick": 100, "end_tick": 148, "sample_count": 4}]
    rows = [
        _row(100, 11, 3), _row(116, 11, 3, alive=False),  # 132 and 148 unread -> gaps
        _row(100, 22, 2, x=0, y=0, z=0),  # origin is a suspect fill, not a position
        _row(100, 33, 2), _row(116, 33, 3),  # side conflict -> dropped
        _row(100, 44, 1),  # spectator
        _row(999, 11, 3),  # not a sampled tick
        _row(132, 55, 2, x=float("nan")),
        _row(148, 66, 3, x=70000),  # out of int16 range -> gap
    ]
    [r] = T.build_trajectories(rows, windows)
    assert r["round"] == 7 and r["step_ticks"] == T.STEP_TICKS and r["sample_count"] == 4
    by = {p["steam_id"]: p for p in r["players"]}
    assert set(by) == {"11", "22", "55", "66"}
    assert r["dropped_players"] == 1
    assert _decode(by["11"]["xyz"]) == [(100, -201, 10), (100, -201, 10), None, None]
    assert by["11"]["alive"] == "10--"
    assert _decode(by["22"]["xyz"]) == [None, None, None, None]
    assert by["22"]["alive"] == "1---"
    assert _decode(by["55"]["xyz"])[2] is None
    assert _decode(by["66"]["xyz"])[3] is None


class _Frame:
    def __init__(self, rows):
        self.rows = rows

    def to_dict(self, orient):
        return self.rows


def _records(frame):
    return frame.to_dict("records") if frame is not None else []


def test_single_bounded_read_at_sample_ticks():
    calls = []

    def parse_ticks(props, *, ticks):
        calls.append((props, ticks))
        return _Frame([_row(t, 11, 3) for t in ticks])

    out = T.parse_round_trajectories(parse_ticks, [{"number": 1, "start_tick": 0, "end_tick": 32}], _records)
    assert len(calls) == 1 and calls[0][0] == list(T.PROPERTIES) and calls[0][1] == [0, 16, 32]
    assert out["status"] == "COMPLETE" and out["schema"] == T.TRAJECTORY_SCHEMA
    assert out["rounds"][0]["players"][0]["alive"] == "111"


def test_read_failure_is_unavailable_but_resource_errors_propagate():
    def broken(props, *, ticks):
        raise ValueError("boom")

    out = T.parse_round_trajectories(broken, [{"number": 1, "start_tick": 0, "end_tick": 32}], _records)
    assert out["status"] == "UNAVAILABLE" and out["reason"] == "READ_FAILED" and out["rounds"] == []

    def oom(props, *, ticks):
        raise MemoryError()

    def reraise(exc):
        if isinstance(exc, MemoryError):
            raise exc

    with pytest.raises(MemoryError):
        T.parse_round_trajectories(oom, [{"number": 1, "start_tick": 0, "end_tick": 32}], _records, reraise)


def test_no_window_or_no_api_is_unavailable():
    assert T.parse_round_trajectories(None, [], _records)["reason"] == "PARSE_TICKS_UNAVAILABLE"
    assert T.parse_round_trajectories(lambda *a, **k: None, [], _records)["reason"] == "NO_ROUND_WINDOW"


def _hot(trajectories):
    return build_hot_payload({"round_trajectories": trajectories}, parser={}, contract_version=1,
                             demo_sha256="a" * 64, upload_id="u")


def test_hot_payload_carries_only_the_documented_shape():
    def parse_ticks(props, *, ticks):
        return _Frame([_row(t, 11, 3) for t in ticks])

    good = T.parse_round_trajectories(parse_ticks, [{"number": 1, "start_tick": 0, "end_tick": 32}], _records)
    hot = _hot(good)["round_trajectories"]
    assert hot["status"] == "COMPLETE" and hot["rounds"][0]["players"][0]["steam_id"] == "11"
    assert _hot(None)["round_trajectories"] is None
    assert _hot({"schema": "other"})["round_trajectories"] is None
    bad = dict(good, rounds=[dict(good["rounds"][0], players=[{"steam_id": "11", "side": "CT", "xyz": "!!", "alive": "111"}])])
    assert _hot(bad)["round_trajectories"]["rounds"][0]["players"] == []
    wrong_len = dict(good, rounds=[dict(good["rounds"][0], players=[dict(good["rounds"][0]["players"][0], alive="11")])])
    assert _hot(wrong_len)["round_trajectories"]["rounds"][0]["players"] == []
