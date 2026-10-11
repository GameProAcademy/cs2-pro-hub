"""Build the Python-side semantic evidence for canonical/shared_fixture.json.

Uses the SAME functions as the real Python reference producer
(summarize_table, build_semantic_evidence), fed with Python-native carriers.
Prints one JSON artifact on stdout. No parser, no DEM, no network.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parents[1] / "services" / "cs2-demo-parser"))
import python_reference as reference  # noqa: E402
from scripts.a91 import canonical_schema as canonical  # noqa: E402
from scripts.a91.test_canonical_schema import decode  # noqa: E402


def main() -> int:
    fixture = json.loads((HERE / "canonical" / "shared_fixture.json").read_text(encoding="utf-8"))
    mutation = json.loads(sys.argv[1]) if len(sys.argv) > 1 else None
    diagnostics = {}
    events = []
    for name, rows in fixture["events"].items():
        table = reference.summarize_table("event:" + name, [decode(row) for row in rows])
        diagnostics["event:" + name] = table["diagnostics"]
        events.append({"eventName": name, "status": "SUCCEEDED", "table": table["summary"]})
    grenade_rows = list(fixture["grenades"])
    if mutation and mutation.get("appendGrenades"):
        # Lets a check put the SAME extra rows into both runtimes.
        grenade_rows += mutation["appendGrenades"]
    grenades = reference.summarize_table("grenades", [decode(row) for row in grenade_rows])
    ticks = reference.summarize_table("ticks", [decode(row) for row in fixture["ticks"]])
    diagnostics["grenades"] = grenades["diagnostics"]
    diagnostics["ticks"] = ticks["diagnostics"]
    if mutation and mutation.get("pythonEnvelopeExtraKey"):
        # Reproduces the regression of commit 3941fae: call metadata leaking
        # into the semantic envelope of one runtime only.
        for event in events:
            event["requestedPlayerFields"] = []
    evidence = reference.build_semantic_evidence(
        header=fixture["header"],
        events=events,
        grenades=grenades["summary"],
        ticks=ticks["summary"],
        tick_probe=fixture["tickProbe"],
        requested_fields=fixture["requestedFields"],
        wanted_ticks=fixture["tickProbe"]["wantedTicks"],
    )
    artifact = {
        "runtime": "PYTHON",
        "canonicalContract": {
            "version": canonical.CANONICAL_CONTRACT_VERSION,
            "digest": canonical.CANONICAL_CONTRACT_DIGEST,
        },
        **evidence,
        "playerInventory": {"status": "AVAILABLE_ON_PYTHON", "value": []},
        "domainAvailability": {"players": "AVAILABLE", "player_identity": "AVAILABLE"},
        "tableDiagnostics": diagnostics,
        "normalizedResult": {
            "header": fixture["header"],
            "events": events,
            "grenades": grenades["summary"],
            "ticks": ticks["summary"],
            "playerIdentity": {"status": "AVAILABLE_ON_PYTHON", "value": []},
        },
    }
    print(reference.stable(artifact))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
