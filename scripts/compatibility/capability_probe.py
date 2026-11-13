"""PM6 fingerprint/capability probe (sandbox only, read-only).

Writes counts and observable header fields; never Steam IDs, names or chat.
Usage: python3 -I scripts/compatibility/capability_probe.py <demo> <out.json>
"""
import os, sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from privacy import write_json  # noqa: E402
import hashlib, json, os, sys, time, resource, traceback

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

def safe(fn):
    try:
        return {"ok": True, "value": fn()}
    except BaseException as e:  # demoparser2 raises plain Exception with a code string
        return {"ok": False, "error": f"{type(e).__name__}: {str(e)[:200]}"}

def main(path, out):
    import importlib.metadata as md
    from demoparser2 import DemoParser
    t0 = time.time()
    with open(path, "rb") as f:
        magic = f.read(8)
    res = {"file": {"sha256": sha256(path), "bytes": os.path.getsize(path), "magic": magic[:8].decode("latin1")},
           "parser": {"demoparser2": md.version("demoparser2")}}
    p = DemoParser(path)
    hdr = safe(p.parse_header)
    if hdr["ok"]:
        h = hdr["value"]
        # server_name is observable metadata but can carry personal/team text: keep only its length and platform tokens.
        sn = (h.get("server_name") or "")
        tokens = [t for t in ("faceit", "gamersclub", "valve", "blast", "esl", "matchzy", "ebot", "pracc", "renown", "esportal") if t in sn.lower()]
        res["header"] = {k: h.get(k) for k in ("demo_file_stamp", "network_protocol", "game_directory", "map_name", "demo_version_name",
                                              "demo_version_guid", "fullpackets_version", "allow_clientside_entities",
                                              "allow_clientside_particles", "addons", "patch_version") if k in h}
        res["header"]["other_keys"] = sorted(k for k in h if k not in res["header"] and k not in ("server_name", "client_name"))
        res["header"]["server_name_len"] = len(sn)
        res["header"]["server_name_platform_tokens"] = tokens
        res["header"]["client_name_present"] = bool(h.get("client_name"))
    else:
        res["header"] = hdr
    ev = safe(p.list_game_events)
    res["game_events"] = sorted(ev["value"]) if ev["ok"] else ev
    counts = {}
    for name in ("player_death", "player_hurt", "weapon_fire", "round_start", "round_end", "round_freeze_end",
                 "round_officially_ended", "begin_new_match", "round_announce_match_start", "bomb_planted",
                 "bomb_defused", "bomb_exploded", "smokegrenade_detonate", "flashbang_detonate", "hegrenade_detonate",
                 "inferno_startburn", "inferno_expire", "player_blind", "item_purchase", "cs_win_panel_match",
                 "round_announce_warmup", "cs_pre_restart", "announce_phase_end", "player_connect", "player_disconnect",
                 "player_team", "bot_takeover", "vote_cast", "server_cvar"):
        r = safe(lambda n=name: p.parse_event(n))
        if r["ok"]:
            df = r["value"]
            if hasattr(df, "columns"):
                counts[name] = {"rows": int(len(df)), "cols": sorted(map(str, df.columns))[:40]}
            else:  # demoparser2 returns [] when the event never occurs
                counts[name] = {"rows": int(len(df)), "cols": [], "empty_type": type(df).__name__}
        else:
            counts[name] = r
    res["events"] = counts
    # Ticks: count only. Small sample of player position/usercmd props on a few ticks.
    probe_props = ["X", "Y", "Z", "team_num", "is_alive", "health", "pitch", "yaw",
                   "usercmd_viewangle_x", "usercmd_viewangle_y", "usercmd_buttons_held", "usercmd_forward_move",
                   "usercmd_left_move", "usercmd_subtick_moves", "usercmd_input_history", "usercmd_mouse_dx"]
    deaths = counts.get("player_death", {})
    tk = safe(lambda: p.parse_event("player_death", other=["game_time"]))
    ticks = []
    if tk["ok"] and hasattr(tk["value"], "columns") and len(tk["value"]):
        ticks = sorted(set(int(t) for t in tk["value"]["tick"].tolist()))[:20]
    props = {}
    for prop in probe_props:
        r = safe(lambda pr=prop: p.parse_ticks([pr], ticks=ticks) if ticks else p.parse_ticks([pr]))
        if r["ok"]:
            df = r["value"]
            col = prop if prop in df.columns else None
            nn = int(df[col].notna().sum()) if col else 0
            props[prop] = {"rows": int(len(df)), "non_null": nn, "column_present": col is not None}
        else:
            props[prop] = r
    res["tick_props_on_death_ticks"] = {"ticks_sampled": len(ticks), "props": props}
    pi = safe(p.parse_player_info)
    if pi["ok"]:
        df = pi["value"]
        sid = df["steamid"].astype(str) if "steamid" in df.columns else None
        res["player_info"] = {"rows": int(len(df)), "cols": sorted(map(str, df.columns)),
                              "steamid_zero_or_null": int((sid.isin(["0", "None", "nan"])).sum()) if sid is not None else None,
                              "team_numbers": sorted(set(int(x) for x in df["team_number"].dropna().tolist())) if "team_number" in df.columns else None}
    else:
        res["player_info"] = pi
    cv = safe(lambda: p.parse_convars() if hasattr(p, "parse_convars") else None)
    if cv["ok"] and isinstance(cv["value"], dict):
        keys = cv["value"]
        res["convars"] = {"count": len(keys), "tickrate_like": {k: keys[k] for k in keys if k in ("sv_minupdaterate", "sv_maxupdaterate", "tv_snapshotrate", "sv_mincmdrate", "mp_maxrounds", "mp_overtime_enable", "mp_overtime_maxrounds", "mp_halftime", "game_type", "game_mode")}}
    else:
        res["convars"] = cv
    res["elapsed_s"] = round(time.time() - t0, 1)
    res["ru_maxrss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
    write_json(out, res)

if __name__ == "__main__":
    try:
        main(sys.argv[1], sys.argv[2])
    except Exception:
        traceback.print_exc()
        sys.exit(2)
