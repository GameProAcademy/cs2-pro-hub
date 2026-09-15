"""Cheap structural validation for PBDEMS2 demo containers.

The upstream demoparser can tolerate incomplete outer frames while answering
some queries. That is useful for parser ergonomics, but unsafe for an analytics
pipeline: a truncated demo must never become an apparently complete
CanonicalMatch.

This validator checks only the PBDEMS2 container/framing layer. It does not
interpret CS2 gameplay semantics and does not replace demoparser2.

The validator is deliberately streaming: demos can be hundreds of MB or more,
so the complete file is never materialized into Python memory.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import BinaryIO

from errors import CorruptedDemoError

CS2_DEMO_MAGIC = b"PBDEMS2\x00"
HEADER_END = 16
DEM_STOP = 0
DEM_FILE_INFO = 2
DEM_SPAWN_GROUPS = 15
DEM_FILE_HEADER = 1
DEM_IS_COMPRESSED = 64


def _read_varint(stream: BinaryIO, file_size: int, offset: int) -> tuple[int, int]:
    """Read one unsigned varint from a buffered stream without loading the file."""
    stream.seek(offset)
    value = 0
    shift = 0
    start = offset
    while offset < file_size:
        raw = stream.read(1)
        if not raw:
            break
        byte = raw[0]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, offset
        shift += 7
        if shift >= 64:
            raise CorruptedDemoError("Demo command header contains an invalid varint.")
    raise CorruptedDemoError(f"Demo ends inside a command header at byte {start}.")


def _read_frame_header(stream: BinaryIO, file_size: int, offset: int) -> tuple[int, int, int, int]:
    """Read an outer frame header and return command, tick, size, payload start."""
    command, offset = _read_varint(stream, file_size, offset)
    tick, offset = _read_varint(stream, file_size, offset)
    size, payload_start = _read_varint(stream, file_size, offset)
    return command, tick, size, payload_start


def _base_command(command: int) -> int:
    return command & ~DEM_IS_COMPRESSED


def _validate_target_offset(
    *,
    target_name: str,
    target_offset: int,
    expected_command: int,
    frames: dict[int, tuple[int, int]],
    file_size: int,
) -> None:
    """Validate a non-zero header offset against the exact scanned frame index."""
    if target_offset == 0:
        return
    if not (HEADER_END <= target_offset < file_size):
        raise CorruptedDemoError(
            f"{target_name} offset {target_offset} is outside the command stream."
        )
    frame = frames.get(target_offset)
    if frame is None:
        raise CorruptedDemoError(
            f"{target_name} offset {target_offset} does not point to a command-frame boundary."
        )
    command, payload_end = frame
    if _base_command(command) != expected_command:
        raise CorruptedDemoError(
            f"Expected {target_name} command ({expected_command}) at byte {target_offset}, "
            f"got {_base_command(command)}."
        )
    if target_name == "DEM_FileInfo" and payload_end != file_size:
        raise CorruptedDemoError("DEM_FileInfo frame does not terminate exactly at EOF.")


def validate_demo_structure(path: str) -> None:
    """Fail closed when the PBDEMS2 container is truncated or inconsistent.

    PBDEMS2 has a 16-byte fixed header. Both footer offsets are absolute frame
    offsets and may be zero when the corresponding command is absent. They are
    validated independently against the complete outer-frame scan. In
    particular, a validator must NOT assume DEM_Stop is immediately followed by
    DEM_SpawnGroups, nor that the two footer offsets have a fixed ordering.
    """
    try:
        file_size = os.path.getsize(path)
        with Path(path).open("rb", buffering=1024 * 1024) as stream:
            if file_size < HEADER_END:
                raise CorruptedDemoError("Demo has an incomplete CS2 container header.")

            header = stream.read(HEADER_END)
            if len(header) < HEADER_END or header[:8] != CS2_DEMO_MAGIC:
                raise CorruptedDemoError("Demo has an invalid or incomplete CS2 container header.")

            file_info_offset = int.from_bytes(header[8:12], "little")
            spawn_groups_offset = int.from_bytes(header[12:16], "little")

            frames: dict[int, tuple[int, int]] = {}
            offset = HEADER_END
            first_frame = True
            stop_count = 0

            while offset < file_size:
                frame_start = offset
                command, _tick, size, payload_start = _read_frame_header(stream, file_size, offset)
                payload_end = payload_start + size
                if payload_end < payload_start or payload_end > file_size:
                    missing = max(0, payload_end - file_size)
                    raise CorruptedDemoError(
                        f"Demo is truncated: command payload is missing {missing} bytes "
                        f"after byte {frame_start}."
                    )

                if payload_end <= frame_start:
                    raise CorruptedDemoError(
                        f"Demo contains a non-advancing command frame at byte {frame_start}."
                    )

                base = _base_command(command)
                if first_frame and base != DEM_FILE_HEADER:
                    raise CorruptedDemoError(
                        f"Demo command stream starts with command {base}, expected DEM_FileHeader (1)."
                    )
                first_frame = False
                frames[frame_start] = (command, payload_end)

                if base == DEM_STOP:
                    stop_count += 1

                offset = payload_end

            if offset != file_size:
                raise CorruptedDemoError("Demo command stream does not terminate exactly at EOF.")
            if first_frame:
                raise CorruptedDemoError("Demo contains no command frames after the fixed header.")
            if stop_count == 0:
                raise CorruptedDemoError(
                    "Demo ends before a terminal DEM_Stop frame; the recording may be incomplete."
                )

            _validate_target_offset(
                target_name="DEM_FileInfo",
                target_offset=file_info_offset,
                expected_command=DEM_FILE_INFO,
                frames=frames,
                file_size=file_size,
            )
            _validate_target_offset(
                target_name="DEM_SpawnGroups",
                target_offset=spawn_groups_offset,
                expected_command=DEM_SPAWN_GROUPS,
                frames=frames,
                file_size=file_size,
            )

    except CorruptedDemoError:
        raise
    except OSError as exc:
        raise CorruptedDemoError("Demo could not be read for structural validation.") from exc
