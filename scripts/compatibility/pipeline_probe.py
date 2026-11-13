"""Run the CS2 PRO worker pipeline locally (sandbox) and keep a privacy-safe summary.

python3 -I scripts/compatibility/pipeline_probe.py <worker_dir> <demo> <out.json>
Mirrors app.py: parse_demo_file -> prepare_evidence with the production identity.
No Steam IDs, names or chat are written.
"""
import hashlib, json, os, sys, time, resource, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from privacy import write_json  # noqa: E402
sys.path.insert(0, sys.argv[1])

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

def main(demo, out):
    import parser as P
    from raw_evidence import prepare_evidence
    t0 = time.time()
    res = {"sha256": sha256(demo), "bytes": os.path.getsize(demo)}
    try:
        output = P.parse_demo_file(demo)
    except BaseException as e:
        res.update({"parse": "ERROR", "error_type": type(e).__name__, "error": str(e)[:300],
                    "error_code": getattr(e, "error_code", None)})
        res["seconds"] = round(time.time() - t0, 1)
        write_json(out, res)
        return
    res["parse_seconds"] = round(time.time() - t0, 1)
    ev = output.get("raw_evidence") or {}
    identity = {"name": "demoparser2", "version": "0.42.2",
                "revision": "git:c3593d48e3b8923048def625cf59144100f59892"}
    prepared = prepare_evidence(ev, parser=identity, contract_version=1, demo_sha256=res["sha256"], file_size=res["bytes"])
    rounds = output.get("rounds") or []
    events = output.get("events") or []
    by_type = {}
    for e in events:
        by_type[e.get("type")] = by_type.get(e.get("type"), 0) + 1
    deaths = [e for e in events if e.get("type") in ("kill", "player_death")]
    players = output.get("players") or []
    res.update({
        "parse": "OK",
        "map": output.get("map") or (output.get("match") or {}).get("map"),
        "tickrate": output.get("tickrate") or (output.get("match") or {}).get("tickrate"),
        "rounds": len(rounds),
        "round_numbers": [r.get("number") or r.get("round") for r in rounds][:60],
        "round_winners_present": sum(1 for r in rounds if r.get("winner") not in (None, "")),
        "events": len(events), "by_type": by_type,
        "deaths": len(deaths),
        "deaths_with_position": sum(1 for e in deaths if e.get("position")),
        "deaths_with_victim_position": sum(1 for e in deaths if e.get("victim_position")),
        "events_round_none": sum(1 for e in events if e.get("round") is None),
        "players": len(players),
        "players_without_steamid": sum(1 for p in players if not p.get("steam_id") and not p.get("steamid")),
        "warnings": sorted(set(map(str, output.get("warnings") or [])))[:60],
        "raw_status": prepared.get("raw_status"),
        "raw_audit_status": prepared.get("raw_audit_status"),
        "raw_block_reasons": prepared.get("raw_block_reasons"),
        "gates": {g.get("gate") or g.get("id"): g.get("status") for g in (prepared.get("gates") or []) if isinstance(g, dict)},
        "partial_parse": (prepared.get("manifest") or {}).get("partial_parse"),
        "extraction_confidence": (prepared.get("manifest") or {}).get("extraction_confidence"),
    })
    res["seconds"] = round(time.time() - t0, 1)
    res["ru_maxrss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
    write_json(out, res)

if __name__ == "__main__":
    try:
        main(sys.argv[2], sys.argv[3])
    except Exception:
        traceback.print_exc()
        sys.exit(2)
