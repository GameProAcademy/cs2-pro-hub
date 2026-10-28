"""Field-level evidence for canonical-demo-v3 (server path).

Inputs are bundles written by src/lib/canonical/__tests__/canonicalV3Harness.test.ts (the exact server
code path after the worker answers) and, for the persistence round trip, per-field digests read back
from the managed database with the SQL that `persisted_digest_sql()` renders. Nothing here touches a
database or a DEM; it only measures what it is given.

Usage:
  python3 -m scripts.canonical_v3.harness evidence --label dust2 --run1 A.bundle.json --run2 B.bundle.json \
      [--persisted persisted.json] > evidence.json
  python3 -m scripts.canonical_v3.harness sql --match-id <uuid>        # read-only SQL for the round trip
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from typing import Any, Iterable

from scripts.canonical_mapping_gate import FIELD_SPECS
from scripts.canonical_v3.contract import SERVER

ENTITY_PATH = {
    "CanonicalMatchSource": ("observation", False), "CanonicalMatch": ("match", False),
    "CanonicalParticipant": ("participants", True), "CanonicalRound": ("rounds", True),
    "CanonicalRoundPlayer": ("roundPlayers", True), "CanonicalEvent": ("events", True),
}
# Values the harness fixes or the pipeline adds after the adapter; compared in production by the
# provenance/lineage gates, not by this round trip.
ROUND_TRIP_EXCLUDED = {
    "CanonicalMatchSource.fetchedAt": "harness fixes the collection time",
    "CanonicalMatchSource.metadata": "parser_revision comes from the worker response, absent from the local harness input",
    "CanonicalMatchSource.sourceVersion": "persisted COALESCE keeps the first non-null value",
    "CanonicalParticipant.internalPlayerId": "harness uses a placeholder id; compared as presence pattern",
    "CanonicalMatch.playedAt": "persisted as matches.played_at only when non-null (COALESCE)",
}
EVENT_TYPES = {"kill", "damage", "flash", "he", "smoke", "molotov", "decoy", "weapon_fire", "bomb_plant",
               "bomb_defuse", "bomb_explode", "round_start", "round_end", "grenade"}
STEAM = re.compile(r"^7656119\d{10}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def values(bundle: dict, field: str) -> list[Any]:
    entity, name = field.split(".", 1)
    key, many = ENTITY_PATH[entity]
    rows = bundle[key] if many else [bundle[key]]
    out = []
    for row in rows:
        value: Any = row
        for part in name.split("."):
            value = value.get(part) if isinstance(value, dict) else None
        out.append(value)
    return out


def _num(x: float | int) -> str:
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, int) or (isinstance(x, float) and math.isfinite(x) and x == int(x) and abs(x) < 2**53):
        return str(int(x))
    return f"{x:.6f}".rstrip("0").rstrip(".")


def jsonb_text(value: Any) -> str:
    """The text PostgreSQL prints for a jsonb value (key order: length, then bytes)."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return _num(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ", ".join(jsonb_text(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=lambda k: (len(k.encode()), k.encode()))
        return "{" + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {jsonb_text(value[k])}" for k in keys) + "}"
    raise TypeError(type(value))


def canon(value: Any) -> str:
    if value is None:
        return "∅"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return _num(value)
    if isinstance(value, (dict, list)):
        return jsonb_text(value)
    return str(value)


def digest(items: Iterable[Any]) -> str:
    texts = sorted(canon(v) for v in items)
    return hashlib.sha256("\n".join(texts).encode()).hexdigest()[:16]


# --------------------------------------------------------------------------------------------- #
# Semantic checks named in contract.SERVER[...]["checks"]. Each returns (ok, detail).
# --------------------------------------------------------------------------------------------- #
def _rounds(b):
    return b["rounds"]


def run_check(name: str, field: str, vals: list[Any], b: dict) -> tuple[bool, str]:
    nn = [v for v in vals if v is not None]
    if name.startswith("equals:"):
        want = name.split(":", 1)[1]
        return all(canon(v) == want for v in vals), want
    if name.startswith("in:"):
        allowed = set(name.split(":", 1)[1].split(","))
        return all(v in allowed for v in vals), ",".join(sorted(allowed))
    simple = {
        "iso8601": lambda: all(isinstance(v, str) and re.match(r"^\d{4}-\d\d-\d\dT", v) for v in vals),
        "array": lambda: all(isinstance(v, list) for v in vals),
        "object": lambda: all(isinstance(v, dict) for v in vals),
        "boolean": lambda: all(isinstance(v, bool) for v in vals),
        "boolean_or_null": lambda: all(v is None or isinstance(v, bool) for v in vals),
        "string": lambda: all(isinstance(v, str) and v for v in vals),
        "string_or_null": lambda: all(v is None or (isinstance(v, str) and v) for v in vals),
        "sha256": lambda: all(isinstance(v, str) and SHA256.match(v) for v in vals),
        "map_code": lambda: all(isinstance(v, str) and re.match(r"^de_[a-z0-9_]+$", v) for v in vals),
        "unit_interval_or_null": lambda: all(v is None or (isinstance(v, (int, float)) and 0 <= v <= 1) for v in vals),
        "steam_id64": lambda: all(isinstance(v, str) and STEAM.match(v) for v in vals),
        "steam_id64_or_null": lambda: all(v is None or (isinstance(v, str) and STEAM.match(v)) for v in vals),
        "non_negative_or_null": lambda: all(v is None or (isinstance(v, (int, float)) and v >= 0) for v in vals),
        "non_negative_int": lambda: all(v is None or (isinstance(v, int) and not isinstance(v, bool) and v >= 0) for v in vals),
        "equals_rounds_length": lambda: all(v == len(b["rounds"]) for v in vals),
        "equals_participants_length": lambda: all(v == len(b["participants"]) for v in vals),
        "equals_events_length": lambda: all(v == len(b["events"]) for v in vals),
        "equals_resolved_count": lambda: all(v == sum(1 for p in b["participants"] if p.get("internalPlayerId")) for v in vals),
        "round_numbers_contiguous": lambda: sorted(vals) == list(range(1, len(vals) + 1)),
        "round_fk": lambda: set(vals) <= {r["roundNumber"] for r in b["rounds"]},
        "participant_fk": lambda: set(vals) <= {p["participantKey"] for p in b["participants"]},
        "participant_fk_or_null": lambda: set(nn) <= {p["participantKey"] for p in b["participants"]},
        "event_type_allowlist": lambda: set(vals) <= EVENT_TYPES,
    }
    if name in simple:
        return bool(simple[name]()), name
    if name == "uuid_only_on_target":
        ok = all((p.get("internalPlayerId") is not None) == bool(p.get("isTargetPlayer")) for p in b["participants"]) \
            and all(isinstance(v, str) and UUID.match(v) for v in nn)
        return ok, "internal id set iff target"
    if name == "one_target_when_attached":
        return sum(1 for p in b["participants"] if p.get("isTargetPlayer")) <= 1, "<= 1 target"
    if name == "identity_status_coherent":
        return all(p["identityStatus"] == ("correlated" if p.get("internalPlayerId") else "unlinked")
                   for p in b["participants"]), "correlated iff internal id"
    if name == "identity_confidence_coherent":
        return all(p.get("identityConfidence") == (1 if p.get("internalPlayerId") else None)
                   for p in b["participants"]), "1 iff correlated, else null"
    if name == "ten_per_round":
        per = {}
        for rp in b["roundPlayers"]:
            fieldname = field.split(".", 1)[1]
            if rp.get(fieldname) is not None:
                per[rp["roundNumber"]] = per.get(rp["roundNumber"], 0) + 1
        bad = {r["roundNumber"]: per.get(r["roundNumber"], 0) for r in b["rounds"] if per.get(r["roundNumber"], 0) != 10}
        return not bad, f"rounds without 10 values: {bad}"
    if name == "pistol_800":
        sides = {r["roundNumber"]: {} for r in b["rounds"]}
        for rp in b["roundPlayers"]:
            sides[rp["roundNumber"]][rp["participantKey"]] = rp.get("side")
        firsts = [1] + [n for n in range(2, len(sides) + 1)
                        if sum(1 for k, s in sides[n].items() if sides[n - 1].get(k) not in (None, s)) >= 8]
        bad = [n for n in firsts if {rp["moneyStart"] for rp in b["roundPlayers"] if rp["roundNumber"] == n} != {800}]
        return not bad, f"pistol rounds {firsts}; not all 800: {bad}"
    if name in ("defuse_implies_plant", "explode_implies_plant"):
        key = "bombDefused" if name.startswith("defuse") else "bombExploded"
        return all(not r.get(key) or r.get("bombPlanted") for r in b["rounds"]), name
    if name == "tick_domain_rounds":
        rs = sorted(b["rounds"], key=lambda r: r["roundNumber"])
        ok = all(isinstance(r["startTick"], int) and isinstance(r["endTick"], int) and r["startTick"] < r["endTick"] for r in rs)
        ok = ok and all(a["endTick"] <= c["startTick"] for a, c in zip(rs, rs[1:]))
        return ok, "start < end <= next start"
    if name == "tick_domain_events":
        bounds = {r["roundNumber"]: (r["startTick"], r["endTick"]) for r in b["rounds"]}
        outside = [e for e in b["events"] if e.get("tick") is not None
                   and not (bounds[e["roundNumber"]][0] <= e["tick"] <= bounds[e["roundNumber"]][1])]
        return not outside and all(isinstance(v, int) for v in vals), f"events outside their round: {len(outside)}"
    if name == "time_monotonic_in_round":
        by: dict[int, list] = {}
        for e in b["events"]:
            if e.get("tick") is not None and e.get("gameTimeSeconds") is not None:
                by.setdefault(e["roundNumber"], []).append((e["tick"], e["gameTimeSeconds"]))
        bad = 0
        for rows in by.values():
            rows.sort()
            bad += sum(1 for (t1, s1), (t2, s2) in zip(rows, rows[1:]) if t2 > t1 and s2 < s1)
        return bad == 0, f"time decreases with tick: {bad}"
    raise KeyError(f"unknown check {name}")


def representation_holds(field: str, vals: list[Any]) -> tuple[bool, str]:
    rep = SERVER[field]["representation"]
    ok = all((v == rep and type(v) is type(rep)) if rep is not None else v is None for v in vals)
    return ok, f"every value == {canon(rep)}"


def field_evidence(bundle: dict, field: str) -> dict[str, Any]:
    vals = values(bundle, field)
    state = SERVER[field]["state"]
    out: dict[str, Any] = {
        "rows": len(vals), "non_null": sum(v is not None for v in vals),
        "zero": sum(1 for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool) and v == 0),
        "empty_object": sum(1 for v in vals if v == {}), "digest": digest(vals),
    }
    if state == "available":
        out["checks"] = {c: dict(zip(("ok", "detail"), run_check(c, field, vals, bundle))) for c in SERVER[field]["checks"]}
    else:
        ok, detail = representation_holds(field, vals)
        out["representation"] = {"ok": ok, "detail": detail}
    return out


# --------------------------------------------------------------------------------------------- #
# Persistence round trip: per-field multiset digests read back from the managed database.
# --------------------------------------------------------------------------------------------- #
TABLE_FILTER = {"matches": "id = '{m}'", "match_sources": "match_id = '{m}' AND source = 'demo'",
                "match_participants": "match_id = '{m}'", "match_rounds": "match_id = '{m}'",
                "round_players": "match_id = '{m}'", "round_events": "match_id = '{m}'"}
NUMERIC_COLUMNS = {"round_events.time_seconds", "round_events.distance", "round_events.damage",
                   "match_participants.identity_confidence", "match_rounds.duration_seconds",
                   "match_rounds.start_time_seconds", "match_rounds.end_time_seconds", "round_players.damage"}


def _sql_text(target: str, ptype: str) -> str:
    parts = target.split(".")
    table, column, sub = parts[0], parts[1], parts[2:]
    if sub:
        e = f"{column}->'{sub[0]}'"
        return f"CASE jsonb_typeof({e}) WHEN 'string' THEN {column}->>'{sub[0]}' WHEN 'null' THEN '\u2205' ELSE coalesce(({e})::text,'\u2205') END"
    if f"{table}.{column}" in NUMERIC_COLUMNS:
        return f"coalesce(rtrim(rtrim(round({column}::numeric,6)::text,'0'),'.'),'\u2205')"
    if ptype == "timestamptz":
        return f"coalesce(to_char({column} AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'\u2205')"
    return f"coalesce({column}::text,'\u2205')"


def persisted_digest_sql(match_id: str) -> str:
    """One read-only SELECT returning {field: {"rows": n, "digest": first 16 hex of sha256}}.
    The digest is sha256 over the sorted canonical texts joined by newlines (same as digest())."""
    by_table: dict[str, list[str]] = {}
    for field, spec in FIELD_SPECS.items():
        table = spec["persistenceTarget"].split(".")[0]
        expr = _sql_text(spec["persistenceTarget"], spec["persistenceType"])
        by_table.setdefault(table, []).append(f"('{field}', {expr})")
    parts = []
    for table, rows in by_table.items():
        where = TABLE_FILTER[table].format(m=match_id)
        parts.append(f"SELECT x.f, x.t FROM public.{table} CROSS JOIN LATERAL (VALUES {', '.join(rows)}) x(f, t) WHERE {where}")
    return ("SELECT jsonb_object_agg(f, jsonb_build_object('rows', n, 'digest', d)) FROM (SELECT f, count(*) AS n, "
            "left(encode(sha256(convert_to(string_agg(t, E'\\n' ORDER BY t COLLATE \"C\"), 'UTF8')), 'hex'), 16) AS d FROM (\n"
            + "\nUNION ALL\n".join(parts) + "\n) s GROUP BY f) g")


def evidence(label: str, run1: dict, run2: dict | None, persisted: dict | None) -> dict[str, Any]:
    fields = {}
    for field in FIELD_SPECS:
        e1 = field_evidence(run1, field)
        item: dict[str, Any] = {"state": SERVER[field]["state"], "run1": e1}
        if run2 is not None:
            e2 = field_evidence(run2, field)
            item["deterministic"] = e1["digest"] == e2["digest"] and e1["rows"] == e2["rows"]
        if persisted is not None:
            if field in ROUND_TRIP_EXCLUDED:
                item["round_trip"] = {"status": "EXCLUDED", "reason": ROUND_TRIP_EXCLUDED[field]}
            else:
                got = persisted.get(field) or {}
                item["round_trip"] = {"status": "EQUAL" if (got.get("digest") == e1["digest"] and got.get("rows") == e1["rows"])
                                      else "DIFFERENT", "persisted": got, "bundle": {"rows": e1["rows"], "digest": e1["digest"]}}
        fields[field] = item
    return {"label": label, "contract": "canonical-demo-v3", "path": "server", "fields": fields}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    ev = sub.add_parser("evidence")
    ev.add_argument("--label", required=True)
    ev.add_argument("--run1", required=True)
    ev.add_argument("--run2")
    ev.add_argument("--persisted")
    sq = sub.add_parser("sql")
    sq.add_argument("--match-id", required=True)
    args = ap.parse_args(argv)
    if args.cmd == "sql":
        if not UUID.match(args.match_id):
            raise SystemExit("match id must be a uuid")
        print(persisted_digest_sql(args.match_id))
        return 0
    load = lambda p: json.load(open(p, encoding="utf-8")) if p else None  # noqa: E731
    persisted = load(args.persisted)
    if isinstance(persisted, dict) and "rows" in persisted and isinstance(persisted["rows"], list):
        persisted = next(iter(persisted["rows"][0].values()))
    json.dump(evidence(args.label, load(args.run1), load(args.run2), persisted), sys.stdout, indent=1)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
