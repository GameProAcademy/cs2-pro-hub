# Parser event capability matrix

Status for all rows: `CATALOGUED / REAL_DEM_NOT_RUN / CANONICAL_BLOCKED`.

| Family | Events |
| --- | --- |
| Combat | `player_death`, `player_hurt`, `player_blind`, `bullet_damage`, `bullet_impact` |
| Weapons | `weapon_fire`, `weapon_fire_on_empty`, `weapon_reload`, `weapon_zoom`, `weapon_zoom_rifle`, `item_purchase`, `item_pickup`, `item_equip`, `item_remove` |
| Grenades | `grenade_thrown`, `flashbang_detonate`, `smokegrenade_detonate`, `smokegrenade_expired`, `molotov_detonate`, `inferno_startburn`, `inferno_expire`, `inferno_extinguish`, `hegrenade_detonate`, `decoy_detonate` |
| Rounds | `round_start`, `round_end`, `round_mvp` |
| Bomb | `bomb_planted`, `bomb_defused`, `bomb_exploded`, `bomb_beginplant`, `bomb_begindefuse`, `bomb_abortplant`, `bomb_abortdefuse`, `bomb_dropped`, `bomb_pickup` |
| Zones | `enter_bombzone`, `exit_bombzone`, `enter_buyzone`, `exit_buyzone` |

The matrix has 40 unique event names. Catalogue presence is not observation, parity, determinism, identity proof or Canonical authorization: documented ≠ verified ≠ canonical-authorized.

## Added catalogue events

| Event name | Source | Parser support | Normalization | Canonical | Identity dependency | Tick dependency | Availability | Known limitations | Evidence scope | Independently verified | Canonical authorized |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bullet_damage` | `demoparser2==0.42.0` via `list_game_events` + `parse_event` | `CATALOGUED / REAL_DEM_NOT_RUN` | `NOT_RUN` | `BLOCKED` | Required for actor/victim semantics | Required for ordered event semantics | Declared by project catalogue; runtime presence not observed in this phase | Field presence, null semantics, identity and tick coverage remain unverified | Runtime-observable; not fixture-only | `NO` | `NO` |
| `inferno_extinguish` | `demoparser2==0.42.0` via `list_game_events` + `parse_event` | `CATALOGUED / REAL_DEM_NOT_RUN` | `NOT_RUN` | `BLOCKED` | Required if an extinguishing participant is reported | Required for ordered event semantics | Declared by project catalogue; runtime presence not observed in this phase | Event payload, ownership attribution and tick coverage remain unverified | Runtime-observable; not fixture-only | `NO` | `NO` |