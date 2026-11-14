"""PM2 (FACEIT Nuke): a BOT kicked when the disconnected player reconnects emits a victimless,
attackerless ``world`` player_death at the exact tick of the BOT's player_disconnect. Only that
fully evidenced row is omitted from the normalized events; every other row is kept."""
from adapter import build_raw_parser_output, drop_bot_replacement_world_deaths

NAN = float("nan")


def _death(tick, victim=NAN, attacker=NAN, weapon="world"):
    return {"tick": tick, "user_steamid": victim, "attacker_steamid": attacker, "weapon": weapon}


BOT_LEFT = {"tick": 100, "networkid": "BOT", "xuid": 0, "user_steamid": NAN, "reason": 3}


def test_drops_only_the_fully_evidenced_bot_removal():
    warnings = []
    kept = drop_bot_replacement_world_deaths(
        [_death(100), _death(100, victim="7656119000000001", attacker="7656119000000002", weapon="ak47"),
         _death(200), _death(100, weapon="trigger_hurt"), _death(100, attacker="7656119000000002")],
        [BOT_LEFT, {"tick": 200, "networkid": "[U:1:1]", "xuid": "7656119000000003", "user_steamid": "7656119000000003"}],
        warnings,
    )
    assert [row["tick"] for row in kept] == [100, 200, 100, 100]
    assert warnings == ["bot_replacement_world_deaths_omitted:1"]


def test_without_a_bot_disconnect_nothing_is_dropped():
    warnings = []
    rows = [_death(100), _death(300)]
    assert drop_bot_replacement_world_deaths(rows, None, warnings) == rows
    assert drop_bot_replacement_world_deaths(rows, [], warnings) == rows
    assert warnings == []


def test_a_human_disconnect_at_the_same_tick_is_not_evidence():
    human = {"tick": 100, "networkid": "[U:1:9]", "xuid": "7656119000000009", "user_steamid": "7656119000000009"}
    assert len(drop_bot_replacement_world_deaths([_death(100)], [human], [])) == 1


def test_end_to_end_the_contract_has_no_victimless_kill_and_reports_it():
    raw = {
        "header": {}, "players": [], "round_starts": [{"tick": 1}], "round_ends": [{"tick": 500, "winner": 2}],
        "player_death": [_death(100), _death(150, victim="7656119000000001", attacker="7656119000000002", weapon="ak47")],
        "event_tables": {"player_disconnect": [BOT_LEFT]},
    }
    out = build_raw_parser_output(raw)
    kills = [e for e in out["events"] if e["type"] == "player_death"]
    assert len(kills) == 1 and kills[0]["tick"] == 150
    assert "bot_replacement_world_deaths_omitted:1" in out["warnings"]
