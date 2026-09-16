"""Static compatibility gates for APP main -> Railway surgical synchronization."""
from pathlib import Path

from hot_payload import HOT_SCHEMA_VERSION
from raw_artifact import CHUNK_HARD_MAX_BYTES, CHUNK_TARGET_BYTES, RAW_SCHEMA_VERSION
from settings import DEFAULT_CONTRACT_VERSION, HARD_MAX_PAYLOAD_BYTES, TARGET_PAYLOAD_BYTES

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = ROOT.parents[1]
RUNBOOK = REPOSITORY / "docs" / "PHASE-2.7.2D.4-RAILWAY-ALIGNMENT.md"


def test_contract_versions_and_transport_limits_are_frozen():
    assert DEFAULT_CONTRACT_VERSION == HOT_SCHEMA_VERSION == RAW_SCHEMA_VERSION == 1
    assert TARGET_PAYLOAD_BYTES == CHUNK_TARGET_BYTES == 4 * 1024 * 1024
    assert HARD_MAX_PAYLOAD_BYTES == CHUNK_HARD_MAX_BYTES == 8 * 1024 * 1024


def test_runtime_has_no_privileged_backend_credentials():
    runtime = "\n".join(
        path.read_text(encoding="utf-8")
        for path in ROOT.glob("*.py")
    ).lower()
    for forbidden in ("service_role_key", "supabase_service_role", "database_password"):
        assert forbidden not in runtime


def test_sync_runbook_preserves_railway_memory_guards_without_claiming_local_ownership():
    runbook = RUNBOOK.read_text(encoding="utf-8")
    assert "MUST PRESERVE FROM RAILWAY" in runbook
    assert "parser_child.py" in runbook
    assert "parse_grenades(grenades=False)" in runbook
    assert "READY FOR RAILWAY SYNC" in runbook
    assert "not **READY FOR REAL E2E**" in runbook