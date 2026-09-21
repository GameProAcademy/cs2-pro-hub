"""Static G.6-R candidate identity and runtime-surface gates."""

from pathlib import Path
import re

from settings import DEFAULT_CONTRACT_VERSION, PARSER_NAME, PARSER_VERSION


ROOT = Path(__file__).resolve().parents[1]
CANDIDATE_SHA = "2f8a76645c6030659f2ed0480469b1452e75f72e"
REQUIRED_RUNTIME_FUNCTIONS = (
    "_parse_event_with_context",
    "_available_events",
    "_parse_ticks",
    "_parse_grenades",
    "_audit_full_tick_domain",
    "_discover_updated_fields",
    "build_raw_evidence",
    "extract_raw_material",
    "parse_demo_file",
)


def test_candidate_identity_is_immutable_full_git_sha():
    assert re.fullmatch(r"[0-9a-f]{40}", CANDIDATE_SHA)
    assert PARSER_NAME == "demoparser2"
    assert PARSER_VERSION == "0.42.0"
    assert DEFAULT_CONTRACT_VERSION == 1


def test_candidate_parser_contains_the_required_runtime_surface():
    source = (ROOT / "parser.py").read_text(encoding="utf-8")
    for function_name in REQUIRED_RUNTIME_FUNCTIONS:
        assert re.search(rf"^def {function_name}\(", source, re.MULTILINE)


def test_production_identity_has_no_stale_fallback():
    source = (ROOT / "settings.py").read_text(encoding="utf-8")
    assert 'FORBIDDEN_REVISIONS = frozenset({"pypi-0.42.0"' in source
    assert "_GIT_REVISION.fullmatch(candidate)" in source
    assert "PARSER_BUILD_REVISION must be an exact git:<full-commit-sha>" in source
