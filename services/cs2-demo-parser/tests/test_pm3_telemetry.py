"""PM3 (R5.8.30) — event telemetry for duels/aim (module C) and utility (module D).

Fields demoparser2 already returns and the adapter now maps, never inventing values:
weapon_fire shooter/weapon/silenced, player_hurt hitgroup/health_after, player_death
hitgroup/thru_smoke/attacker_in_air, grenade detonation positions, and inferno_startburn
(the only molotov/incendiary evidence in CS2 demos) with its thrower.
"""
import adapter

A = "76561198000000001"
B = "76561198000000002"


def fields(name, row):
    return adapter._event_fields(name, row)


def test_weapon_fire_maps_shooter_and_joinable_weapon_name():
    out = fields("weapon_fire", {"user_steamid": A, "weapon": "weapon_ak47", "silenced": False})
    assert out == {"attacker": A, "weapon": "ak47", "silenced": False}


def test_weapon_fire_without_shooter_has_no_actor():
    out = fields("weapon_fire", {"weapon": "weapon_m4a1_silencer"})
    assert "attacker" not in out and out["weapon"] == "m4a1_silencer"


def test_weapon_fire_keeps_names_without_prefix_and_never_blanks_them():
    assert fields("weapon_fire", {"user_steamid": A, "weapon": "knife"})["weapon"] == "knife"
    assert fields("weapon_fire", {"user_steamid": A, "weapon": "weapon_"})["weapon"] == "weapon_"


def test_player_hurt_maps_hitgroup_and_health_after_only_when_valid():
    out = fields("player_hurt", {"attacker_steamid": A, "user_steamid": B, "weapon": "ak47", "dmg_health": 27,
                                 "dmg_armor": 4, "hitgroup": "chest", "health": 73})
    assert out["hitgroup"] == "chest" and out["health_after"] == 73
    unknown = fields("player_hurt", {"attacker_steamid": A, "user_steamid": B, "hitgroup": "elbow", "health": None})
    assert "hitgroup" not in unknown and "health_after" not in unknown


def test_player_hurt_health_zero_is_kept_as_zero():
    out = fields("player_hurt", {"attacker_steamid": A, "user_steamid": B, "hitgroup": "head", "health": 0})
    assert out["health_after"] == 0


def test_player_death_maps_hitgroup_smoke_and_airborne():
    out = fields("player_death", {"attacker_steamid": A, "user_steamid": B, "weapon": "awp", "hitgroup": "head",
                                  "thrusmoke": True, "attackerinair": False})
    assert out["hitgroup"] == "head" and out["thru_smoke"] is True and out["attacker_in_air"] is False


def test_player_death_absent_flags_stay_absent():
    out = fields("player_death", {"attacker_steamid": A, "user_steamid": B, "weapon": "awp"})
    assert not {"hitgroup", "thru_smoke", "attacker_in_air"} & set(out)


def test_detonation_position_is_all_three_axes_or_nothing():
    full = fields("smokegrenade_detonate", {"user_steamid": A, "x": 1.5, "y": -2.0, "z": 3.25})
    assert full == {"attacker": A, "detonation_position": {"x": 1.5, "y": -2.0, "z": 3.25}}
    partial = fields("hegrenade_detonate", {"user_steamid": A, "x": 1.5, "y": None, "z": 3.25})
    assert partial == {"attacker": A}


def test_inferno_startburn_is_emitted_with_thrower_and_fire_position():
    assert "inferno_startburn" in adapter.SUPPORTED_EVENTS
    out = fields("inferno_startburn", {"user_steamid": A, "x": 10.0, "y": 20.0, "z": 30.0})
    assert out == {"attacker": A, "detonation_position": {"x": 10.0, "y": 20.0, "z": 30.0}}
    assert "attacker" not in fields("inferno_startburn", {"x": 1.0, "y": 1.0, "z": 1.0})


def test_blind_and_expiry_events_are_still_not_thrower_evidence():
    # player_blind's attacker is the flasher by the game's own field, not a projectile owner;
    # expiries never carry a thrower.
    assert "detonation_position" not in fields("player_blind", {"attacker_steamid": A, "user_steamid": B, "x": 1, "y": 1, "z": 1})
    assert fields("inferno_expire", {"user_steamid": A}) == {}
    assert fields("smokegrenade_expired", {"user_steamid": A}) == {}
