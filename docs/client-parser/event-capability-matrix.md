# Parser event capability matrix

Status for all rows: `CATALOGUED / REAL_DEM_NOT_RUN / CANONICAL_BLOCKED`.

| Family | Events |
| --- | --- |
| Combat | `player_death`, `player_hurt`, `player_blind` |
| Weapons | `weapon_fire`, `weapon_fire_on_empty`, `weapon_reload`, `weapon_zoom`, `weapon_zoom_rifle`, `item_purchase`, `item_pickup`, `item_equip`, `item_remove` |
| Grenades | `grenade_thrown`, `flashbang_detonate`, `smokegrenade_detonate`, `smokegrenade_expired`, `molotov_detonate`, `inferno_startburn`, `inferno_expire`, `hegrenade_detonate`, `decoy_detonate` |
| Rounds | `round_start`, `round_end`, `round_mvp` |
| Bomb | `bomb_planted`, `bomb_defused`, `bomb_exploded`, `bomb_beginplant`, `bomb_begindefuse`, `bomb_abortplant`, `bomb_abortdefuse`, `bomb_dropped`, `bomb_pickup`, `bomb_beep` |
| Zones | `enter_bombzone`, `exit_bombzone`, `enter_buyzone`, `exit_buyzone` |

The matrix has 38 unique event names. Catalogue presence is not observation, parity, determinism, identity proof or Canonical authorization.