"""R5.8.12 current workflow pin is additive and leaves prior release snapshots frozen."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OLD_SHA = "523cee5b0fecc21c7ce2b5f538b42670eec3fed1"
CURRENT_SHA = "f5e8ffb19d03dca410591f8d2fd38dc47a3ca485"


def test_r5_8_12_advances_only_the_current_workflow_pin():
    old = json.loads((ROOT / "docs/reference/r5_8_11/spec.json").read_text(encoding="utf-8"))
    current = json.loads((ROOT / "docs/reference/r5_8_12/spec.json").read_text(encoding="utf-8"))
    registry = json.loads((ROOT / "scripts/approved_attestation_workflow.json").read_text(encoding="utf-8"))
    assert old["workflow_source_sha"] == OLD_SHA
    assert current["workflow_source_sha"] == registry["source_sha"] == CURRENT_SHA
    assert current["semantic_commit"] == old["semantic_commit"] == "c2e045b0f71a7699c935b65ffe514fe526889de3"
    assert current["build_commit"] == old["build_commit"] == "eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1"
    assert current["critical_hashes"] == old["critical_hashes"]
    for key in ("deployment_id", "branch", "deployment_commit", "observed"):
        assert current[key] == old[key], key


def test_r5_8_12_migration_is_forward_only_and_fail_closed():
    sql = (ROOT / "supabase/migrations/20261017180000_r5_8_12_repin_workflow_source_sha.sql").read_text(encoding="utf-8")
    for signature in (
        "public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)",
        "public.assert_verified_parser_provenance(uuid)",
        "public.enforce_approved_attestation_workflow()",
    ):
        assert signature in sql
    assert OLD_SHA in sql and CURRENT_SHA in sql
    assert "R5_8_12_UNEXPECTED_WORKFLOW_PIN_STATE" in sql
    assert "R5_8_12_POSTCONDITION_INVALID" in sql
    assert "_expected_count constant integer := 2" in sql
    assert "R5_8_12_UNEXPECTED_WORKFLOW_PIN_STATE" in sql
    assert "R5_8_12_FUNCTION_PROPERTIES_CHANGED" in sql
    assert "'return_type', pg_catalog.pg_get_function_result(p.oid)" in sql
    assert "'acl', p.proacl::text" in sql
    statements = [line.strip() for line in sql.splitlines() if line.strip() and not line.lstrip().startswith("--")]
    assert statements[0] == "BEGIN;" and statements[-1] == "COMMIT;"
    import sys
    sys.path.insert(0, str(ROOT / "scripts/repin"))
    import r5_8_11  # noqa: PLC0415
    assert r5_8_11.target_md5(current) == "321d649a3defcf3daf61de8b5f6d6ad2"
    # The two boundary bodies were already at the approved current workflow pin;
    # R5.8.12 therefore preserves their observed MD5s while repinning the recorder.
    assert current["database_target_md5"] == old["database_target_md5"]
    rollback = (ROOT / "docs/reference/r5_8_12/rollback.sql").read_text(encoding="utf-8")
    assert OLD_SHA in rollback and CURRENT_SHA in rollback
    assert "R5_8_12_ROLLBACK_UNEXPECTED_PIN_STATE" in rollback
    assert "R5_8_12_ROLLBACK_POSTCONDITION_INVALID" in rollback
    assert "CREATE OR REPLACE" not in sql  # preserves the existing declaration via pg_get_functiondef
    assert "COMMENT ON FUNCTION" in sql
    assert "UPDATE public.parser_runtime_provenance" not in sql
    assert "DELETE FROM public.parser_runtime_provenance" not in sql
