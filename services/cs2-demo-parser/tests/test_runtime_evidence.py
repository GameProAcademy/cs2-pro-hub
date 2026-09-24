from __future__ import annotations

from types import SimpleNamespace

from runtime_evidence import collect_runtime_evidence, parse_memory_snapshot

def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        revision="git:" + "a" * 40,
        build_revision="git:" + "b" * 40,
        contract_version=1,
        max_demo_bytes=1_500 * 1024 * 1024,
        max_payload_bytes=8 * 1024 * 1024,
        download_timeout_seconds=120.0,
        parse_timeout_seconds=240.0,
        is_production=True,
    )

def test_runtime_evidence_is_secret_free_and_identity_bound() -> None:
    evidence = collect_runtime_evidence(_settings())
    assert evidence["evidenceClass"] == "CONTROLLED_RUNTIME_PRE_FLIGHT"
    assert evidence["parser"]["name"] == "demoparser2"
    assert evidence["parser"]["declaredVersion"] == "0.42.0"
    assert evidence["parser"]["revision"].startswith("git:")
    assert evidence["parser"]["contractVersion"] == 1
    assert evidence["secretsIncluded"] is False
    assert "token" not in str(evidence).lower()
    assert "password" not in str(evidence).lower()

def test_runtime_memory_snapshot_has_non_negative_values() -> None:
    snapshot = parse_memory_snapshot()
    assert all(value is None or value >= 0 for value in snapshot.values())