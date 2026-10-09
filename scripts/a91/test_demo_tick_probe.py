#!/usr/bin/env python3
"""Synthetic regression tests for bounded tick-range discovery."""

from __future__ import annotations

import tempfile
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.a91.tick_probe import derive_tick_probe


def varint(value: int) -> bytes:
    value &= 0xFFFFFFFF
    out = bytearray()
    while value > 0x7F:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    out.append(value)
    return bytes(out)


def frame(command: int, tick: int, payload: bytes = b"\x00") -> bytes:
    return varint(command) + varint(tick) + varint(len(payload)) + payload


def demo_bytes() -> bytes:
    header = bytearray(16)
    header[:8] = b"PBDEMS2\x00"
    header[8:12] = (2).to_bytes(4, "little")
    return bytes(header) + frame(1, 0, b"header") + frame(3, 100) + frame(3, 200) + frame(4, 0xFFFFFFFF, b"")


with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / "probe.dem"
    path.write_bytes(demo_bytes())
    result = derive_tick_probe(path)
    assert result["source"] == "DEM_FRAME_HEADER_SCAN"
    assert result["maxFrameTick"] == 200, result
    assert result["wantedTicks"] == [0, 100, 199], result
    assert result["frameCount"] == 4, result

    truncated = Path(directory) / "truncated.dem"
    truncated.write_bytes(demo_bytes()[:-2])
    try:
        derive_tick_probe(truncated)
    except ValueError as error:
        assert str(error) == "A91_DEMO_FRAME_SCAN_INVALID"
    else:
        raise AssertionError("truncated frame was accepted")

print("A9.1 DEM tick-probe regression tests PASS")
