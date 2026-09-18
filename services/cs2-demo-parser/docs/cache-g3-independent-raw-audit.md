# Cache G.3 — Independent RAW manifest audit and Railway parity gate

## 1. Scope

This is a read-only audit of the preserved Cache RAW artifact and local parser contracts. It does not approve or mutate the artifact, execute a job, persist Canonical data, deploy Railway, or alter secrets.

## 2. Immutable artifact identity

| Property | Value |
|---|---|
| Job | `a31f5c25-b0d8-41ac-8225-27814cd1732a` |
| Upload | `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043` |
| Attempt | `7` |
| Dispatch attempt | `2` (job history; not part of manifest identity) |
| Artifact | `3a1e5225-f0f2-427a-97b8-c21dac936e7d` |
| Demo SHA-256 | `0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d` |
| Root digest | `ccbcafe55e7eca0270d6fb85cdd996f0163b5d209367819fa11c71efd06328d2` |
| Audit evidence digest | `6349c2cb79b14a1f8d9fa69eaef5dd940cbc3ceb6d39c15bb60f8e3cdc7f4c64` (recomputed: exact match) |
| State | artifact `READY`, RAW `READY`, audit `BLOCKED` |

## 3. Storage manifest identity

The manifest was downloaded again from the private Storage path through a server-only privileged client. JSON parsing, schema 1, contract 1, job/upload/attempt/demo/root identity, parser identity, and the SHA-256 digest of `audit_evidence` all matched. No write method was invoked.

## 4. Artifact physical inventory

- 24 chunks; all recorded as VERIFIED.
- 373,754 physical JSONL rows.
- 2,799,488 compressed bytes.
- Root digest preserved.
- No Canonical match or match_id exists for this job.

## 5. Exact 178 field reconciliation

| Metric | Result |
|---|---:|
| A total (physical manifest legacy unmapped) | 178 |
| B total (fixture) | 178 |
| A unique | 178 |
| B unique | 178 |
| A minus B | `[]` |
| B minus A | `[]` |
| Duplicates A | `[]` |
| Duplicates B | `[]` |
| Current projection | 4 MAPPED; 174 RAW_ONLY_INTENTIONAL; 0 unknown |
| Result | **PASS** |

## 6. Full field-by-field classification

Each row below comes from `manifest.audit_evidence.field_mappings`; the fixture is comparison-only. The current decision is recomputed with `mapping_inventory()`.

| raw_field | manifest | fixture | current code | app_field | canonical_field | reason | decision |
|---|---|---|---|---|---|---|---|
| announce_phase_end.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| announce_phase_end.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| bomb_defused.c4 | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| bomb_dropped.entindex | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| bomb_exploded.c4 | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| bomb_planted.c4 | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| chat_message.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| chat_message.chat_message | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| chat_message.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| chat_message.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| chat_message.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_intermission.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_intermission.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_pre_restart.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_pre_restart.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_round_final_beep.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_round_final_beep.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_round_start_beep.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_round_start_beep.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_win_panel_match.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| cs_win_panel_match.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| decoy_detonate.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| decoy_started.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| decoy_started.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| decoy_started.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| decoy_started.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| decoy_started.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| decoy_started.x | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| decoy_started.y | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| decoy_started.z | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| entity_killed.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| entity_killed.damagebits | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| entity_killed.entindex_attacker | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| entity_killed.entindex_inflictor | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| entity_killed.entindex_killed | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| entity_killed.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.angles_x | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.angles_y | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.angles_z | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.attack_type | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.ent_origin_x | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.ent_origin_y | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.ent_origin_z | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.inaccuracy | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.item_def_index | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.mode | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.num_bullets_remaining | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.origin_x | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.origin_y | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.origin_z | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.player | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.player_inair | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.player_scoped | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.recoil_index | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.round | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.seed | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.sound_dsp_effect | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.sound_type | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.spread | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| fire_bullets.weapon_id | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| flashbang_detonate.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| game_state.name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | MAPPED | hot.*[].player_name | match_sources.metadata.semantic_player_data | explicit semantic mapping | PASS |
| game_state.steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | MAPPED | hot.*[].player | match_sources.metadata.semantic_player_data | explicit semantic mapping | PASS |
| game_state.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | MAPPED | hot.*[].tick | match_sources.metadata.semantic_player_data | explicit semantic mapping | PASS |
| grenade.grenade_entity_id | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as full-resolution grenade trajectory evidence. | PASS |
| grenade.grenade_type | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as full-resolution grenade trajectory evidence. | PASS |
| grenade.name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as full-resolution grenade trajectory evidence. | PASS |
| grenade.steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as full-resolution grenade trajectory evidence. | PASS |
| grenade.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as full-resolution grenade trajectory evidence. | PASS |
| grenade.x | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as full-resolution grenade trajectory evidence. | PASS |
| grenade.y | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as full-resolution grenade trajectory evidence. | PASS |
| grenade.z | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as full-resolution grenade trajectory evidence. | PASS |
| header.addons | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| header.allow_clientside_entities | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| header.allow_clientside_particles | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| header.client_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| header.demo_file_stamp | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| header.demo_version_guid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| header.fullpackets_version | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| header.game_directory | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| header.patch_version | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| header.server_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as parser/demo provenance metadata. | PASS |
| hegrenade_detonate.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_chase.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_chase.distance | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_chase.inertia | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_chase.ineye | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_chase.phi | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_chase.target1 | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_chase.target2 | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_chase.theta | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_chase.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_versioninfo.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_versioninfo.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| hltv_versioninfo.version | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| inferno_expire.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| inferno_startburn.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| item_pickup.defindex | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| item_pickup.item | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| item_pickup.silent | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_activate.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_activate.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_activate.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_activate.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_connect.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_connect_full.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_connect_full.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_connect_full.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_connect_full.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_death.assistedflash | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_death.attackerblind | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | MAPPED | events[].blind | CanonicalEvent.data.blind | explicit semantic mapping | PASS |
| player_death.attackerinair | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_death.dominated | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_death.noreplay | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_death.revenge | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_death.weapon_fauxitemid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_death.weapon_itemid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_death.weapon_originalowner_xuid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_death.wipe | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping.urgent | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping.x | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping.y | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping.z | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping_stop.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping_stop.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping_stop.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping_stop.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_ping_stop.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_sound.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_sound.duration | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_sound.radius | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_sound.step | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_sound.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_sound.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_sound.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_spawn.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_spawn.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_spawn.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_spawn.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_team.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_team.disconnect | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_team.isbot | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_team.oldteam | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_team.silent | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_team.team | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_team.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_team.user_name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| player_team.user_steamid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_announce_final.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_announce_final.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_announce_last_round_half.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_announce_last_round_half.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_announce_match_point.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_announce_match_point.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_announce_match_start.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_announce_match_start.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_freeze_end.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_freeze_end.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_time_warning.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| round_time_warning.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| server_cvar.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| server_cvar.name | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| server_cvar.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| server_cvar.value | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| server_message.__event__ | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| server_message.server_message | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| server_message.tick | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| smokegrenade_detonate.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |
| smokegrenade_expired.entityid | UNMAPPED_BUT_AVAILABLE | LEGACY_UNMAPPED | RAW_ONLY_INTENTIONAL | — | — | Preserved as reviewed parser-native event evidence. | PASS |

## 7. Four MAPPED proofs

| RAW | Parser/raw preservation | APP/HOT destination | Canonical destination | Result |
|---|---|---|---|---|
| `game_state.name` | returned and preserved in tick evidence | `hot.*[].player_name` | `match_sources.metadata.semantic_player_data` | PASS |
| `game_state.steamid` | returned and preserved in tick evidence | `hot.*[].player` | `match_sources.metadata.semantic_player_data` | PASS |
| `game_state.tick` | returned and preserved in tick evidence | `hot.*[].tick` | `match_sources.metadata.semantic_player_data` | PASS |
| `player_death.attackerblind` | returned in 139-row death stream and preserved | `events[].blind` | `CanonicalEvent.data.blind` | PASS |

## 8. 174 RAW_ONLY reasons

All 174 rows above are accepted only by named field/family allow-lists. Header provenance, full-resolution grenade trajectories, reviewed parser-native events, and future behavioral/aim material each carry explicit non-empty reasons. No wildcard fallback exists; unknown future fields remain blocking.

## 9. Event capability audit

- 68 capabilities: 44 `PARSED_SUCCESSFULLY`, 23 `NOT_PRESENT_IN_DEMO`, 1 `AVAILABLE_BUT_EMPTY` (`player_connect`).
- `event_capability_coverage=COMPLETE`. Absence, empty return, and parser failure remain distinct.

## 10. Event field audit

For each of 68 capabilities, returned, non-null, null-only, and preserved inventories were cross-checked. Every successfully parsed event has an exact preserved-field entry. Key observed surfaces include deaths (139 rows), hurt (585), weapon fire (3,208), grenade throws (532), bomb plants (22), defuses (2), explosions (11), team changes (10), and native fire bullets (2,559).

## 11. Player audit

Player info returned and preserved exactly `name`, `steamid`, and `team_number`. Parser identity, participant identity, Steam identity, and internal identity remain separate; nickname alone is not promoted to Steam evidence.

## 12. Round audit

The immutable manifest has an empty round inventory and therefore historical `ROUND-COVERAGE=FAIL`. Read-only tick evidence contains observed `total_rounds_played` states used by current deterministic derivation, but unknown winner, score, end tick, or team values remain NULL/UNKNOWN. The historical artifact is not retroactively approved.

## 13. Tick audit

`tick_sampling.coverage=SAMPLE`, sample size 1,270, first tick 2,227, last tick 253,818, limit 4,096, full extraction false, total demo ticks unavailable. `tick_samples` is explicitly not a full timeline.

## 14. Bomb audit

Bomb capabilities distinguish absent begin/abort streams from observed plant/drop/pickup/defuse/explode streams. Their native fields are preserved; isolated events do not synthesize bomb state.

## 15. Damage audit

`player_hurt` returned 585 rows with native health, armor, damage, weapon and identities. `bullet_damage` was not present. No complete damage statistic is asserted from an absent surface.

## 16. Death audit

`player_death` returned 139 rows. `attackerblind` is the only newly promoted field in the 178 corpus; other reviewed native flags remain RAW-only unless already part of the prior canonical contract.

## 17. Grenade audit

Trajectory inventory contains grenade type/entity identity/player/Steam/tick/x/y/z. Samples remain samples, distinct from grenade events; no event is synthesized from a trajectory row.

## 18. Team/score audit

Observed player team number is preserved as parser context, not human identity. Score inventory is empty, so no score, winner, or team fact is inferred from round count or nickname.

## 19. Usercmd audit

Usercmd capability is `UNAVAILABLE` with the recorded reason that the client command stream is not universally enumerable in server demos. It is not converted to empty/false evidence.

## 20. Forensic inventory audit

All named inventories exist with consistent types. Event returned/non-null/null-only/preserved inventories cross-reference correctly. The material contradiction is historical and explicit: round inventory is empty while sampled game-state rows retain enough evidence for current deterministic derivation.

## 21. Three historical gates

| Gate | Stored result | Independent interpretation |
|---|---|---|
| RAW-EVIDENCE-01 | FAIL | Historical artifact remains FAIL; current code projection can pass only in a new authorized run. |
| RAW→CANONICAL | FAIL | Historical 178 unknowns remain immutable; current code classifies all 178 without wildcard. |
| ROUND-COVERAGE | FAIL | Historical round inventory absent; current code can derive only evidence-supported boundaries. |

## 22. Canonical admission audit

PASS. Demo persistence requires an explicit RAW approval. Artifact identity, READY states, audit approval, chunk chain, root digest, manifest identity, audit evidence digest, all gates, mappings, and persisted approval are independently checked before the Canonical RPC. Blocked, unknown, digest mismatch, unknown mapping, failed gate, duplicate mapping, and missing reason remain blocked in tests.

## 23. Railway parity

| File | Main blob SHA | Railway branch SHA | Status | Classification |
|---|---|---|---|---|
| `parser.py` | `7973203fcd0fc86f08d444db22128fe0cc5311bb` | unavailable | PENDING | MUST SYNC determination blocked |
| `raw_evidence.py` | `faa48232c9774a5ead5c58885731b4deb50d3644` | unavailable | PENDING | MUST SYNC determination blocked |
| `raw_artifact.py` | `062cabc587a3504d04cab8297668c780d98feebd` | unavailable | PENDING | MUST SYNC determination blocked |
| `hot_payload.py` | `041c66a30dde55d8237b4e6b07f02375b2e09817` | unavailable | PENDING | MUST SYNC determination blocked |
| `settings.py` | `35eecfb06223812137a4a2f17114aae57cb7fe54` | unavailable | PENDING | MUST SYNC determination blocked |
| `adapter.py` | `49deee965706066208ecd88fd2e0869c448ed92f` | unavailable | PENDING | MUST SYNC determination blocked |
| `app.py` | `7995670c41ed743d98da34309546443de000cceb` | unavailable | PENDING | MUST SYNC determination blocked |
| `demo_integrity.py` | `3cb4291d657b8cb23f12731c46742e810e01c597` | unavailable | PENDING | MUST SYNC determination blocked |
| `requirements.txt` | `c5caead735f64450ecefb07b16ffa72808409962` | unavailable | PENDING | MUST SYNC determination blocked |
| `worker_main.py` | `MISSING` | unavailable | PENDING | MUST SYNC determination blocked |

The requested `infra/cs2-parser-worker-v8` ref is absent from all accessible local/origin refs. The secondary remote is inaccessible in this environment. No same/different or MUST PRESERVE conclusion is fabricated. Railway `/version` is observable, but it does not substitute for source-tree parity.

## 24. Parser identity

| Source | Identity |
|---|---|
| Immutable artifact | `demoparser2@0.42.0`; semantic/build `git:e3e98bed16a71b23b05f8b2742b1d92b6198efd4`; contract 1 |
| Current main | `demoparser2@0.42.0`; contract 1; source HEAD `35bb99b712b37079cab7a9bff309898ccc193e76` |
| Running Railway | `demoparser2@0.42.0`; semantic `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`; build `git:41550d9a4bf5ef818fc1042c75946728084563f7`; contract 1 |

Contract and parser package match. Semantic and build revisions do not match the immutable artifact; that is expected historical provenance, not artifact corruption. The running Railway build differs from the APP configured build pin and its source branch is unavailable, so the next E2E remains blocked pending controlled parity sync and a new `/version` proof.

## 25. Tests

- Independent physical manifest reconciliation: PASS (178/178).
- Python parser suite: 169 passed, 3 skipped, 1 deprecation warning.
- TypeScript pipeline/Canonical: 554 passed.
- APP suite: 918 passed.
- Typecheck, compileall, and diff check: PASS.
- Initial Python run without an exposed asyncio plugin failed only at test collection; rerun in an isolated complete environment passed.

## 26. Formal status

| Gate | Status |
|---|---|
| G3-01 Manifest integrity | **PASS** |
| G3-02 Exact 178 reconciliation | **PASS** |
| G3-03 Individual field classification | **PASS** |
| G3-04 Four mappings | **PASS** |
| G3-05 174 RAW-only reasons | **PASS** |
| G3-06 Event coverage | **PASS** |
| G3-07 Tick coverage | **PASS (SAMPLE)** |
| G3-08 Round evidence | **PASS (limitations explicit)** |
| G3-09 Player evidence | **PASS** |
| G3-10 Bomb evidence | **PASS** |
| G3-11 Combat evidence | **PASS** |
| G3-12 Grenade evidence | **PASS** |
| G3-13 Team/score evidence | **PASS (unknowns preserved)** |
| G3-14 Forensic inventory | **PASS** |
| G3-15 Three gates | **PASS (historical FAIL correctly reproduced)** |
| G3-16 Canonical fail-closed | **PASS** |
| G3-17 Parser identity | **PASS (mismatch documented)** |
| G3-18 Railway parity | **PENDING — branch unavailable** |
| G3-19 Test suite | **PASS** |
| G3-20 Run 1 authorization | **BLOCKED** |

## 27. Open blockers and recommendation

- Obtain an auditable ref for `infra/cs2-parser-worker-v8`; compare and classify each requested file before any synchronization.
- Align the APP build revision pin with the intentionally selected Railway build, then prove `/version` again.
- Only after G3-18 is PASS may a separate authorized phase consider Cache Run 1.

Current conclusion: **G3 PARTIAL — NOT READY FOR CONTROLLED RAILWAY PARITY SYNC** because source parity is not independently auditable.

## Operational confirmation

- Cache Run 1: NOT EXECUTED
- Run 2: NOT EXECUTED
- Canonical: NOT CREATED
- Original artifact/chunks/manifest: NOT MODIFIED
- Railway: NOT DEPLOYED
- Secrets: NOT MODIFIED
- Phase 2.8: NOT STARTED
- Commits generated: NONE
