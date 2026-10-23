"""D25: a bomb event absent from the demo's own event inventory is zero occurrences.

Production evidence (Dust2 job 30ee2fe7, 2026-10-23): the match had no defuse, so
``bomb_defused`` was not in ``list_game_events()``; extract_raw_material stored it as None
("unreadable"), every round's ``bomb_defused`` flag was unknown and admission v3 blocked the
demo with ``RAW-V2-13-bomb: round_bomb_defused_flag_unknown``.
"""
from adapter import build_raw_parser_output
from parser import resolve_bomb_streams_absent_from_inventory

A, B = "76561198000000001", "76561198000000002"


def raw(**overrides):
    base = {
        "header": {"map_name": "de_dust2"},
        "players": [{"steamid": A, "name": "a", "team_number": 2}, {"steamid": B, "name": "b", "team_number": 3}],
        "round_starts": [{"tick": 100}, {"tick": 500}],
        "round_ends": [{"tick": 400, "winner": "CT", "reason": "t_killed"}, {"tick": 900, "winner": "T", "reason": "target_bombed"}],
        "player_death": [{"tick": 250, "attacker_steamid": A, "user_steamid": B, "weapon": "ak47", "headshot": False}],
        "player_hurt": [], "player_blind": [],
        "bomb_planted": [{"tick": 700, "user_steamid": A}],
        "bomb_defused": None,
        "bomb_exploded": [{"tick": 880}],
        "event_inventory": ["bomb_exploded", "bomb_planted", "player_blind", "player_death", "player_hurt", "round_end", "round_start"],
        "event_inventory_error": None,
        "event_errors": {},
        "event_tables": {"bomb_defused": None},
        "warnings": [],
    }
    base.update(overrides)
    return base


def flags(material):
    resolve_bomb_streams_absent_from_inventory(material)
    return [r.get("bomb_defused") for r in build_raw_parser_output(material)["rounds"]]


def test_absent_from_a_successful_inventory_means_no_defuse():
    material = raw()
    assert flags(material) == [False, False]
    assert material["bomb_defused"] == []
    assert any(w.startswith("bomb_defused_absent_from_event_inventory") for w in material["warnings"])


def test_the_forensic_event_table_is_left_untouched():
    material = raw()
    resolve_bomb_streams_absent_from_inventory(material)
    assert material["event_tables"]["bomb_defused"] is None


def test_unknown_when_the_inventory_failed_or_is_empty():
    assert flags(raw(event_inventory_error=RuntimeError("x"))) == [None, None]
    assert flags(raw(event_inventory=[])) == [None, None]
    material = raw()
    del material["event_inventory"]
    assert flags(material) == [None, None]


def test_unknown_when_inventoried_but_unreadable():
    assert flags(raw(event_inventory=raw()["event_inventory"] + ["bomb_defused"])) == [None, None]
    assert flags(raw(event_errors={"bomb_defused": RuntimeError("parse failed")})) == [None, None]


def test_unknown_when_a_round_end_names_the_outcome():
    material = raw(round_ends=[{"tick": 400, "winner": "CT", "reason": "bomb_defused"}, {"tick": 900, "winner": "T"}])
    assert flags(material) == [None, None]
    assert "bomb_defused_absent_from_inventory_contradicted_by_round_end" in material["warnings"]


def test_a_read_stream_is_never_replaced():
    material = raw(bomb_defused=[{"tick": 800}], event_inventory=raw()["event_inventory"] + ["bomb_defused"])
    assert flags(material) == [False, True]


def test_explosion_absence_is_contradicted_by_target_bombed():
    material = raw(bomb_exploded=None, event_inventory=[n for n in raw()["event_inventory"] if n != "bomb_exploded"])
    resolve_bomb_streams_absent_from_inventory(material)
    assert material["bomb_exploded"] is None
    assert "bomb_exploded_absent_from_inventory_contradicted_by_round_end" in material["warnings"]
