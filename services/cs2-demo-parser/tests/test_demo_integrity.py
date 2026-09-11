from __future__ import annotations

import struct

import pytest

from demo_integrity import validate_demo_structure
from errors import CorruptedDemoError


MAGIC = b"PBDEMS2\x00"


def varint(value: int) -> bytes:
    out = bytearray()
    while value >= 0x80:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    out.append(value)
    return bytes(out)


def frame(cmd: int, tick: int, payload: bytes = b"") -> bytes:
    return varint(cmd) + varint(tick) + varint(len(payload)) + payload


def complete_demo(*, compressed_stop: bool = False, spawn_payload: bytes = b"spawn", fileinfo_payload: bytes = b"info") -> bytes:
    file_header = frame(1, 0, b"header")
    stop = frame(64 if compressed_stop else 0, 100)
    spawn_offset = 16 + len(file_header) + len(stop)
    spawn = frame(15, 100, spawn_payload)
    file_info_offset = spawn_offset + len(spawn)
    file_info = frame(2, 100, fileinfo_payload)
    return MAGIC + struct.pack("<II", file_info_offset, spawn_offset) + file_header + stop + spawn + file_info


def test_accepts_complete_source2_trailer_layout(tmp_path):
    path = tmp_path / "complete.dem"
    path.write_bytes(complete_demo())
    validate_demo_structure(str(path))


def test_accepts_compressed_demstop(tmp_path):
    path = tmp_path / "compressed-stop.dem"
    path.write_bytes(complete_demo(compressed_stop=True))
    validate_demo_structure(str(path))


def test_rejects_declared_payload_beyond_eof(tmp_path):
    path = tmp_path / "truncated.dem"
    path.write_bytes(MAGIC + b"\x00" * 8 + b"\x01\x00\x08abc")
    with pytest.raises(CorruptedDemoError, match="truncated|offsets"):
        validate_demo_structure(str(path))


def test_rejects_incomplete_final_command_header(tmp_path):
    path = tmp_path / "truncated-header.dem"
    path.write_bytes(MAGIC + b"\x00" * 8 + frame(1, 0, b"abc") + b"\x80")
    with pytest.raises(CorruptedDemoError):
        validate_demo_structure(str(path))


def test_rejects_missing_demstop(tmp_path):
    path = tmp_path / "no-stop.dem"
    file_header = frame(1, 0, b"header")
    spawn = frame(15, 100, b"spawn")
    spawn_offset = 16 + len(file_header)
    file_info_offset = spawn_offset + len(spawn)
    file_info = frame(2, 100, b"info")
    path.write_bytes(
        MAGIC + struct.pack("<II", file_info_offset, spawn_offset) + file_header + spawn + file_info
    )
    with pytest.raises(CorruptedDemoError, match="DEM_Stop|terminal"):
        validate_demo_structure(str(path))


def test_rejects_wrong_spawn_groups_offset(tmp_path):
    data = bytearray(complete_demo())
    spawn_offset = struct.unpack("<I", data[12:16])[0]
    data[12:16] = struct.pack("<I", spawn_offset + 1)
    path = tmp_path / "wrong-spawn-offset.dem"
    path.write_bytes(data)
    with pytest.raises(CorruptedDemoError):
        validate_demo_structure(str(path))


def test_rejects_wrong_file_info_frame(tmp_path):
    data = bytearray(complete_demo())
    file_info_offset = struct.unpack("<I", data[8:12])[0]
    data[file_info_offset] = 7
    path = tmp_path / "wrong-file-info.dem"
    path.write_bytes(data)
    with pytest.raises(CorruptedDemoError, match="DEM_FileInfo"):
        validate_demo_structure(str(path))


def test_rejects_trailing_bytes_after_file_info(tmp_path):
    path = tmp_path / "tail.dem"
    path.write_bytes(complete_demo() + b"x")
    with pytest.raises(CorruptedDemoError, match="file-info|EOF|offsets"):
        validate_demo_structure(str(path))
