"""Cheap structural validation for PBDEMS2 demo command streams.

The upstream demoparser intentionally tolerates a frame whose declared payload
runs past EOF (it skips the frame and continues). That is useful for some parser
queries, but unsafe for an analytics product: a truncated demo must never become
an apparently complete CanonicalMatch.

This module validates only the outer command framing. It does not interpret game
semantics and does not replace demoparser2.
"""

from __future__ import annotations

from pathlib import Path

from errors import CorruptedDemoError

CS2_DEMO_MAGIC = b"PBDEMS2\x00"
HEADER_END = 16


def _read_varint(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    shift = 0
    start = offset
    while offset < len(data):
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, offset
        shift += 7
        if shift >= 64:
            raise CorruptedDemoError("Demo command header contains an invalid varint.")
    raise CorruptedDemoError(
        f"Demo ends inside a command header at byte {start}."
    )


def validate_demo_structure(path: str) -> None:
    """Fail closed when the PBDEMS2 command stream is truncated.

    We intentionally require a terminal DemStop command. A match recording that
    ends before DemStop is not considered a complete demo for analytics, even if
    demoparser2 can extract useful observations from its prefix.
    """
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise CorruptedDemoError("Demo could not be read for structural validation.") from exc

    if len(data) < HEADER_END or data[:8] != CS2_DEMO_MAGIC:
        # app.py already performs the public magic check; keep this module safe
        # when used independently in tests or future callers.
        raise CorruptedDemoError("Demo has an invalid or incomplete CS2 container header.")

    offset = HEADER_END
    saw_frame = False
    saw_stop = False

    while offset < len(data):
        frame_start = offset
        cmd, offset = _read_varint(data, offset)
        _tick, offset = _read_varint(data, offset)
        size, offset = _read_varint(data, offset)
        saw_frame = True

        payload_end = offset + size
        if payload_end > len(data):
            missing = payload_end - len(data)
            raise CorruptedDemoError(
                f"Demo is truncated: command payload is missing {missing} bytes "
                f"after byte {frame_start}."
            )

        # EDemoCommands.DemStop is 2 in the current Source 2 demo format.
        # The high bit 64 is the compression flag and is not part of the command.
        if (cmd & ~64) == 2:
            saw_stop = True
            if payload_end != len(data):
                # Anything after DemStop is not part of the normal command
                # stream. Keep the file rejected rather than silently accepting
                # an ambiguous tail.
                raise CorruptedDemoError(
                    "Demo contains data after the terminal DemStop command."
                )
            return

        offset = payload_end

    if not saw_frame:
        raise CorruptedDemoError("Demo contains no command frames after its header.")
    if not saw_stop:
        raise CorruptedDemoError(
            "Demo ends without the terminal DemStop command; the recording may be incomplete."
        )
