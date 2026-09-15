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


def demo_bytes(*, compressed_stop: bool = False, include_spawn: bool = True) -> bytes:
    file_header = frame(1, 0, b"header")
    stop = frame(64 if compressed_stop else 0, 100)
    frames = [file_header, stop]

    if include_spawn:
        spawn_offset = 16 + sum(len(item) for item in frames)
        frames.append(frame(15, 100, b"spawn"))
    else:
        spawn_offset = 0

    file_info_offset = 16 + sum(len(item) for item in frames)
    frames.append(frame(2, 100, b"info"))
    body = b"".join(frames)
    return MAGIC + struct.pack("<II", file_info_offset, spawn_offset) + body


def test_accepts_complete_source2_trailer_layout(tmp_path):
    path = tmp_path / "complete.dem"
    path.write_bytes(demo_bytes())
    validate_demo_structure(str(path))


def test_accepts_compressed_demstop(tmp_path):
    path = tmp_path / "compressed-stop.dem"
    path.write_bytes(demo_bytes(compressed_stop=True))
    validate_demo_structure(str(path))


def test_accepts_absent_spawn_groups_offset(tmp_path):
    path = tmp_path / "no-spawn-groups.dem"
    path.write_bytes(demo_bytes(include_spawn=False))
    validate_demo_structure(str(path))


def test_rejects_declared_payload_beyond_eof(tmp_path):
    path = tmp_path / "truncated.dem"
    file_header = frame(1, 0, b"header")
    stop = frame(0, 100)
    malformed = varint(7) + varint(100) + varint(100) + b"abc"
    file_info_offset = 16 + len(file_header) + len(stop) + len(malformed)
    data = MAGIC + struct.pack("<II", file_info_offset, 0) + file_header + stop + malformed
    path.write_bytes(data)
    with pytest.raises(CorruptedDemoError, match="truncated|command payload"):
        validate_demo_structure(str(path))


def test_rejects_incomplete_final_command_header(tmp_path):
    path = tmp_path / "truncated-header.dem"
    file_header = frame(1, 0, b"abc")
    stop = frame(0, 100)
    data = MAGIC + struct.pack("<II", 0, 0) + file_header + stop + b"\x80"
    path.write_bytes(data)
    with pytest.raises(CorruptedDemoError):
        validate_demo_structure(str(path))


def test_rejects_missing_demstop(tmp_path):
    path = tmp_path / "no-stop.dem"
    file_header = frame(1, 0, b"header")
    file_info_offset = 16 + len(file_header)
    file_info = frame(2, 100, b"info")
    path.write_bytes(MAGIC + struct.pack("<II", file_info_offset, 0) + file_header + file_info)
    with pytest.raises(CorruptedDemoError, match="DEM_Stop|terminal"):
        validate_demo_structure(str(path))


def test_rejects_wrong_spawn_groups_offset(tmp_path):
    data = bytearray(demo_bytes())
    spawn_offset = struct.unpack("<I", data[12:16])[0]
    data[12:16] = struct.pack("<I", spawn_offset + 1)
    path = tmp_path / "wrong-spawn-offset.dem"
    path.write_bytes(data)
    with pytest.raises(CorruptedDemoError, match="spawn.*boundary|SpawnGroups"):
        validate_demo_structure(str(path))


def test_rejects_wrong_file_info_frame(tmp_path):
    data = bytearray(demo_bytes())
    file_info_offset = struct.unpack("<I", data[8:12])[0]
    data[file_info_offset] = 7
    path = tmp_path / "wrong-file-info.dem"
    path.write_bytes(data)
    with pytest.raises(CorruptedDemoError, match="DEM_FileInfo"):
        validate_demo_structure(str(path))


def test_rejects_missing_required_file_info_offset(tmp_path):
    data = bytearray(demo_bytes())
    data[8:12] = struct.pack("<I", 0)
    path = tmp_path / "missing-file-info-offset.dem"
    path.write_bytes(data)
    with pytest.raises(CorruptedDemoError, match="FileInfo"):
        validate_demo_structure(str(path))


def test_rejects_trailing_bytes_after_file_info(tmp_path):
    path = tmp_path / "tail.dem"
    path.write_bytes(demo_bytes() + b"x")
    with pytest.raises(CorruptedDemoError):
        validate_demo_structure(str(path))
