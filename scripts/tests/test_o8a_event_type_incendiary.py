"""O8-A item 1: `incendiary` is the only type added to the v3 event allowlist."""
import re
from pathlib import Path

from scripts.canonical_v3 import harness

ROOT = Path(__file__).resolve().parents[2]
BEFORE_O8A = {"kill", "damage", "flash", "he", "smoke", "molotov", "decoy", "weapon_fire", "bomb_plant",
              "bomb_defuse", "bomb_explode", "round_start", "round_end", "grenade"}


def _check(values):
    return harness.run_check("event_type_allowlist", "CanonicalEvent.type", values, {})[0]


def test_only_incendiary_was_added():
    assert harness.EVENT_TYPES - BEFORE_O8A == {"incendiary"}
    assert BEFORE_O8A <= harness.EVENT_TYPES


def test_incendiary_is_accepted_and_unknown_types_are_still_rejected():
    assert _check(["incendiary", "molotov", "kill"])
    for bad in ("Incendiary", "incendiary ", "inferno_startburn", "fire", "", None, "unknown"):
        assert not _check(["kill", bad]), bad


def test_incendiary_is_produced_validated_and_persisted_by_the_pipeline():
    normalizer = (ROOT / "src/lib/pipeline/normalizer.ts").read_text()
    assert 'inferno_startburn: "incendiary"' in normalizer          # produced: parser alias -> canonical type
    assert re.search(r'"incendiary",', normalizer)                    # validated: normalizer EVENT_TYPES
    adapter = (ROOT / "services/cs2-demo-parser/adapter.py").read_text()
    assert '"inferno_startburn"' in adapter                           # emitted by the parser
    migrations = "\n".join(p.read_text() for p in sorted((ROOT / "supabase/migrations").glob("*.sql")))
    assert "'incendiary'::text" in migrations or "'incendiary'" in migrations  # persisted: event_type CHECK
