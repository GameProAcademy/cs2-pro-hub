"""PM6 PR B: the compatibility harness never writes identifiers and verifies fixtures by hash."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "compatibility"))

from privacy import PrivacyViolation, assert_no_identifiers, write_json  # noqa: E402
import verify_corpus  # noqa: E402


def test_counts_types_and_column_inventories_are_allowed():
    assert_no_identifiers({
        "events": {"player_chat": {"rows": 28, "cols": ["text", "user_name", "user_steamid"]}},
        "header": {"server_name_len": 39, "server_name_platform_tokens": ["gamersclub"]},
        "player_info": {"rows": 10, "steamid_zero_or_null": 0},
    })


@pytest.mark.parametrize("payload", [
    {"sample": "76561198000000001"},
    {"rows": [{"tick": 1, "note": "killer 76561197960690195"}]},
    {"header": {"server_name": "Some Server"}},
    {"chat": [{"text": "gl hf"}]},
    {"player": {"name": "someone"}},
])
def test_identifiers_are_refused(payload):
    with pytest.raises(PrivacyViolation):
        assert_no_identifiers(payload)


def test_write_json_refuses_before_touching_disk(tmp_path):
    target = tmp_path / "out.json"
    with pytest.raises(PrivacyViolation):
        write_json(str(target), {"steamid": "76561198000000001"})
    assert not target.exists()
    write_json(str(target), {"rows": 3})
    assert json.loads(target.read_text()) == {"rows": 3}


def test_verify_corpus_matches_by_sha256_and_size(tmp_path):
    demo = tmp_path / "x.dem"
    demo.write_bytes(b"PBDEMS2\x00" + b"\x00" * 8)
    digest = verify_corpus.sha256(str(demo))
    manifest = {"fixtures": [{"fixture_id": "synthetic", "sha256": digest, "bytes": demo.stat().st_size}]}
    assert verify_corpus.verify(manifest, [str(demo)])[0]["status"] == "MATCH"
    manifest["fixtures"][0]["bytes"] = 1
    assert verify_corpus.verify(manifest, [str(demo)])[0]["status"] == "SIZE_MISMATCH"
    assert verify_corpus.verify({"fixtures": []}, [str(demo)])[0]["status"] == "UNKNOWN"


def test_probes_write_only_through_the_privacy_guard():
    for name in ("capability_probe.py", "lifecycle_probe.py", "pipeline_probe.py"):
        source = (ROOT / "scripts" / "compatibility" / name).read_text(encoding="utf-8")
        assert "write_json(" in source, name
        assert "json.dump(" not in source, name


def test_harness_lives_outside_the_worker_tree():
    # The H.3-E gate fails with WORKER_TREE_DIFFERS when services/cs2-demo-parser on main differs
    # from the deployed build, so tooling and corpus stay out of that tree.
    assert not (ROOT / "services" / "cs2-demo-parser" / "compatibility").exists()
