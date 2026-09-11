from __future__ import annotations

import pytest

from demo_integrity import validate_demo_structure
from errors import CorruptedDemoError


MAGIC = b"PBDEMS2\x00"


def frame(cmd: int, tick: int, payload: bytes = b"") -> bytes:
    def varint(value: int) -> bytes:
        out = bytearray()
        while value >= 0x80:
            out.append((value & 0x7F) | 0x80)
            value >>= 7
        out.append(value)
        return bytes(out)

    return varint(cmd) + varint(tick) + varint(len(payload)) + payload


def test_accepts_complete_command_stream(tmp_path):
    path = tmp_path / "complete.dem"
    path.write_bytes(MAGIC + b"\x00" * 8 + frame(1, 0, b"abc") + frame(2, 100))
    validate_demo_structure(str(path))


def test_rejects_declared_payload_beyond_eof(tmp_path):
    path = tmp_path / "truncated.dem"
    path.write_bytes(MAGIC + b"\x00" * 8 + b"\x01\x00\x08abc")
    with pytest.raises(CorruptedDemoError, match="truncated"):
        validate_demo_structure(str(path))


def test_rejects_incomplete_final_command_header(tmp_path):
    path = tmp_path / "truncated-header.dem"
    path.write_bytes(MAGIC + b"\x00" * 8 + frame(1, 0, b"abc") + b"\x80")
    with pytest.raises(CorruptedDemoError):
        validate_demo_structure(str(path))


def test_rejects_missing_demstop(tmp_path):
    path = tmp_path / "no-stop.dem"
    path.write_bytes(MAGIC + b"\x00" * 8 + frame(1, 0, b"abc"))
    with pytest.raises(CorruptedDemoError, match="DemStop"):
        validate_demo_structure(str(path))


def test_rejects_data_after_demstop(tmp_path):
    path = tmp_path / "tail.dem"
    path.write_bytes(MAGIC + b"\x00" * 8 + frame(2, 100) + b"x")
    with pytest.raises(CorruptedDemoError, match="after"):
        validate_demo_structure(str(path))
