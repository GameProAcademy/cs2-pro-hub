"""Bounded, deterministic tick probes derived from real DEM frame headers."""

from __future__ import annotations

from pathlib import Path

MAGIC = b"PBDEMS2\x00"
MAX_U32 = 0xFFFFFFFF
MAX_I32 = 0x7FFFFFFF


def _read_varint(handle, *, clean_eof: bool = False):
    value = 0
    for index in range(5):
        raw = handle.read(1)
        if not raw:
            if clean_eof and index == 0:
                return None
            raise ValueError("A91_DEMO_FRAME_SCAN_INVALID")
        byte = raw[0]
        value |= (byte & 0x7F) << (7 * index)
        if byte & 0x80 == 0:
            return value & MAX_U32
    raise ValueError("A91_DEMO_FRAME_SCAN_INVALID")


def derive_tick_probe(path: str | Path) -> dict:
    """Find the maximum nonnegative frame tick without loading the DEM into RAM.

    The upstream v0.42.0 parse_header() deliberately omits playback_ticks from
    its header map. Do not infer a tick range from an absent field. Scan only
    the DEM framing varints and skip payload bytes; the parser still validates
    and parses the original, full file independently.
    """
    source = Path(path)
    size = source.stat().st_size
    if size < 19:
        raise ValueError("A91_DEMO_FRAME_SCAN_INVALID")

    max_tick = None
    frame_count = 0
    with source.open("rb") as handle:
        if handle.read(8) != MAGIC:
            raise ValueError("A91_DEMO_FRAME_SCAN_INVALID")
        handle.seek(16)

        while handle.tell() < size:
            # Keep the same minimum frame-header guard used by the upstream
            # parser. One or two trailing bytes are not a complete frame.
            if size - handle.tell() < 3:
                break

            command = _read_varint(handle, clean_eof=True)
            if command is None:
                break
            tick_raw = _read_varint(handle)
            payload_size = _read_varint(handle)
            payload_start = handle.tell()

            if payload_size > size - payload_start:
                raise ValueError("A91_DEMO_FRAME_SCAN_INVALID")

            # Upstream casts frame tick varints to i32.
            tick = tick_raw if tick_raw <= MAX_I32 else tick_raw - (MAX_U32 + 1)
            if tick >= 0 and (max_tick is None or tick > max_tick):
                max_tick = tick
            handle.seek(payload_size, 1)
            frame_count += 1

    if frame_count == 0 or max_tick is None or max_tick < 2:
        raise ValueError("A91_TICK_PROBE_RANGE_MISSING")

    wanted = []
    for tick in (0, max_tick // 2, max_tick - 1):
        if tick not in wanted:
            wanted.append(tick)

    return {
        "source": "DEM_FRAME_HEADER_SCAN",
        "maxFrameTick": max_tick,
        "wantedTicks": wanted,
        "frameCount": frame_count,
        "authoritativeDomain": False,
    }
