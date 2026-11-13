"""PM6 probe 2: usercmd content and round lifecycle shape (counts/ticks only, no identities)."""
import os, sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from privacy import write_json  # noqa: E402
import json, sys
from demoparser2 import DemoParser

def main(path, out):
    p = DemoParser(path)
    res = {}
    deaths = p.parse_event("player_death")
    ticks = sorted(set(int(t) for t in deaths["tick"].tolist()))[:40] if hasattr(deaths, "columns") and len(deaths) else []
    props = ["usercmd_viewangle_x", "usercmd_buttons_held", "usercmd_subtick_moves", "usercmd_input_history",
             "usercmd_forward_move", "usercmd_mouse_dx"]
    uc = {}
    for prop in props:
        try:
            df = p.parse_ticks([prop], ticks=ticks)
            col = df[prop] if prop in df.columns else None
            if col is None:
                uc[prop] = {"column": False}
                continue
            def nonempty(v):
                if v is None: return False
                if isinstance(v, float) and v != v: return False
                if hasattr(v, "__len__") and not isinstance(v, str): return len(v) > 0
                return True
            vals = col.tolist()
            ne = sum(1 for v in vals if nonempty(v))
            sample_len = [len(v) for v in vals if hasattr(v, "__len__") and not isinstance(v, str)][:200]
            uc[prop] = {"column": True, "rows": len(vals), "non_empty": ne,
                        "list_len_min": min(sample_len) if sample_len else None,
                        "list_len_max": max(sample_len) if sample_len else None,
                        "type": type(next((v for v in vals if nonempty(v)), None)).__name__}
        except BaseException as e:
            uc[prop] = {"error": f"{type(e).__name__}: {str(e)[:150]}"}
    res["usercmd_on_death_ticks"] = {"ticks": len(ticks), "props": uc}
    life = {}
    for ev in ("round_start", "round_end", "round_officially_ended", "round_freeze_end", "begin_new_match",
               "round_announce_match_start", "cs_pre_restart", "announce_phase_end", "round_announce_warmup",
               "cs_win_panel_match"):
        try:
            df = p.parse_event(ev, other=["total_rounds_played", "is_warmup_period"])
            if hasattr(df, "columns") and len(df):
                rows = []
                for r in df.to_dict("records"):
                    rows.append({k: (r.get(k) if not isinstance(r.get(k), float) or r.get(k) == r.get(k) else None)
                                 for k in ("tick", "total_rounds_played", "is_warmup_period", "winner", "reason", "round") if k in r})
                life[ev] = rows
            else:
                life[ev] = []
        except BaseException as e:
            life[ev] = {"error": f"{type(e).__name__}: {str(e)[:150]}"}
    res["lifecycle"] = life
    try:
        hdr = p.parse_header()
        res["header_keys"] = sorted(hdr.keys())
    except BaseException as e:
        res["header_keys"] = str(e)
    try:
        pi = p.parse_player_info()
        res["player_info_rows"] = int(len(pi))
    except BaseException as e:
        res["player_info_rows"] = str(e)
    try:
        tk = p.parse_ticks(["team_num"], ticks=ticks[:5]) if ticks else None
        res["distinct_players_on_death_ticks"] = int(tk["steamid"].nunique()) if tk is not None and len(tk) else 0
        res["bots_or_zero_steamid_on_death_ticks"] = int((tk["steamid"].astype(str) == "0").sum()) if tk is not None and len(tk) else 0
    except BaseException as e:
        res["distinct_players_on_death_ticks"] = str(e)
    write_json(out, res)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
