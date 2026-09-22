import re
from pathlib import Path

from capability_catalog import EVENT_TYPES


ROOT = Path(__file__).resolve().parents[3]
MATRIX = ROOT / "docs" / "client-parser" / "event-capability-matrix.md"


def documented_events() -> list[str]:
    text = MATRIX.read_text(encoding="utf-8")
    family_table = text.split("## Added catalogue events", 1)[0]
    rows = [line for line in family_table.splitlines() if line.startswith("|")][2:]
    return [event for row in rows for event in re.findall(r"`([a-z0-9_]+)`", row)]


def test_event_capability_matrix_exactly_matches_catalogue() -> None:
    documented = documented_events()
    assert len(documented) == len(set(documented)), "documented event duplicate"
    assert len(EVENT_TYPES) == len(set(EVENT_TYPES)), "catalogue event duplicate"
    assert len(documented) == len(EVENT_TYPES)
    assert set(documented) == set(EVENT_TYPES)
    assert {"bullet_damage", "inferno_extinguish"} <= set(documented)


def test_documented_events_remain_blocked_without_real_evidence() -> None:
    text = MATRIX.read_text(encoding="utf-8")
    assert "documented ≠ verified ≠ canonical-authorized" in text.lower()
    assert "`bullet_damage`" in text and "`inferno_extinguish`" in text
    assert text.count("`NO` | `NO` |") >= 2