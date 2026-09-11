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


def validate_demo_structure(path: str) -> None:
    """Fail closed when the PBDEMS2 container is truncated or internally inconsistent.

    PBDEMS2 has a 16-byte fixed header:

      bytes 0..7   magic
      bytes 8..11  absolute DEM_FileInfo frame offset
      bytes 12..15 absolute DEM_SpawnGroups frame offset

    The outer command stream starts at byte 16. A complete CS2 demo has:

      ... DEM_Stop
      DEM_SpawnGroups frame at the header's spawn-groups offset
      DEM_FileInfo frame at the header's file-info offset
      EOF

    In particular, bytes after DEM_Stop are NOT automatically trailing garbage:
    Source 2 stores spawn groups and file info after the terminal stop frame.
    """
    try:
        file_size = os.path.getsize(path)
        with Path(path).open("rb", buffering=1024 * 1024) as stream:
            header = stream.read(HEADER_END)
            if len(header) < HEADER_END or header[:8] != CS2_DEMO_MAGIC:
                raise CorruptedDemoError("Demo has an invalid or incomplete CS2 container header.")

            file_info_offset = int.from_bytes(header[8:12], "little")
            spawn_groups_offset = int.from_bytes(header[12:16], "little")

            if not (HEADER_END < spawn_groups_offset < file_info_offset < file_size):
                raise CorruptedDemoError(
                    "Demo container offsets are invalid: expected "
                    "16 < spawn_groups_offset < file_info_offset < file_size."
                )

            offset = HEADER_END
            first_frame = True
            stop_payload_end: int | None = None

            while offset < spawn_groups_offset:
                frame_start = offset
                command, _tick, size, payload_start = _read_frame_header(stream, file_size, offset)
                payload_end = payload_start + size
                if payload_end > file_size:
                    missing = payload_end - file_size
                    raise CorruptedDemoError(
                        f"Demo is truncated: command payload is missing {missing} bytes "
                        f"after byte {frame_start}."
                    )

                base = _base_command(command)
                if first_frame and base != DEM_FILE_HEADER:
                    raise CorruptedDemoError(
                        f"Demo command stream starts with command {base}, expected DEM_FileHeader (1)."
                    )
                first_frame = False

                if base == DEM_STOP:
                    stop_payload_end = payload_end
                    break

                offset = payload_end

            if stop_payload_end is None:
                raise CorruptedDemoError(
                    "Demo ends before a terminal DEM_Stop frame; the recording may be incomplete."
                )

            if stop_payload_end != spawn_groups_offset:
                raise CorruptedDemoError(
                    "DEM_Stop does not terminate at the header's DEM_SpawnGroups offset."
                )

            stream.seek(spawn_groups_offset)
            command, _tick, size, payload_start = _read_frame_header(
                stream, file_size, spawn_groups_offset
            )
            payload_end = payload_start + size
            if _base_command(command) != DEM_SPAWN_GROUPS:
                raise CorruptedDemoError(
                    f"Expected DEM_SpawnGroups (15) at byte {spawn_groups_offset}, "
                    f"got {_base_command(command)}."
                )
            if payload_end != file_info_offset:
                raise CorruptedDemoError(
                    "DEM_SpawnGroups frame does not terminate at the header's DEM_FileInfo offset."
                )

            stream.seek(file_info_offset)
            command, _tick, size, payload_start = _read_frame_header(
                stream, file_size, file_info_offset
            )
            payload_end = payload_start + size
            if _base_command(command) != DEM_FILE_INFO:
                raise CorruptedDemoError(
                    f"Expected DEM_FileInfo (2) at byte {file_info_offset}, "
                    f"got {_base_command(command)}."
                )
            if payload_end != file_size:
                raise CorruptedDemoError(
                    "DEM_FileInfo frame does not terminate exactly at EOF."
                )

    except CorruptedDemoError:
        raise
    except OSError as exc:
        raise CorruptedDemoError("Demo could not be read for structural validation.") from exc
