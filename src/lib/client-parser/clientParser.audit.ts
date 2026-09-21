import { sha256Text, stableClientJson } from "./clientParser.hash";
import type { ClientCapabilityClassification } from "./clientParser.types";

export const CLIENT_HEADER_FIELDS = [
  "game_directory",
  "map_name",
  "demo_version_guid",
  "demo_version_name",
  "patch_version",
  "playback_ticks",
  "playback_ticks_per_second",
  "server_name",
  "client_name",
] as const;

export const CLIENT_EVENT_CATALOG = {
  combat: [
    "player_death",
    "player_hurt",
    "weapon_fire",
    "weapon_fire_on_empty",
    "weapon_reload",
    "weapon_zoom",
  ],
  utility: [
    "player_blind",
    "grenade_thrown",
    "flashbang_detonate",
    "smokegrenade_detonate",
    "smokegrenade_expired",
    "molotov_detonate",
    "inferno_startburn",
    "inferno_expire",
    "hegrenade_detonate",
    "decoy_detonate",
  ],
  objective: [
    "round_start",
    "round_end",
    "bomb_planted",
    "bomb_defused",
    "bomb_exploded",
    "bomb_beginplant",
    "bomb_begindefuse",
    "bomb_abortplant",
    "bomb_abortdefuse",
    "bomb_dropped",
    "bomb_pickup",
    "bomb_beep",
    "round_mvp",
    "enter_bombzone",
    "exit_bombzone",
    "enter_buyzone",
    "exit_buyzone",
  ],
  economy: ["item_purchase", "item_pickup", "item_equip", "item_remove", "weapon_zoom_rifle"],
} as const;

export const CLIENT_PRIORITY_EVENTS = Object.values(CLIENT_EVENT_CATALOG).flat();

export const CLIENT_TICK_PROPERTIES = [
  "tick",
  "X",
  "Y",
  "Z",
  "velocity",
  "velocity_X",
  "velocity_Y",
  "velocity_Z",
  "pitch",
  "yaw",
  "aim_punch_angle",
  "shots_fired",
  "is_scoped",
  "health",
  "armor_value",
  "is_alive",
  "life_state",
  "is_airborne",
  "is_crouching",
  "is_walking",
  "is_strafing",
  "active_weapon",
  "active_weapon_name",
  "active_weapon_ammo",
  "balance",
  "start_balance",
  "total_cash_spent",
  "round_start_equip_value",
  "current_equip_value",
  "cash_spent_this_round",
  "weapon_purchases_this_round",
  "weapon_purchases_this_match",
  "game_time",
  "round_start_time",
  "last_place_name",
  "team_num",
  "total_rounds_played",
  "is_bomb_planted",
  "is_bomb_dropped",
  "is_freeze_period",
  "is_warmup_period",
  "aim_punch_angle_vel",
  "ducked",
  "ducking",
  "stamina",
  "velo_modifier",
  "team_name",
  "score",
  "match_start_time",
  "game_start_time",
  "death_time",
  "kills_total",
  "deaths_total",
  "assists_total",
  "alive_time_total",
  "headshot_kills_total",
  "ace_rounds_total",
  "4k_rounds_total",
  "3k_rounds_total",
  "damage_total",
  "objective_total",
  "utility_damage_total",
  "enemies_flashed_total",
  "equipment_value_total",
  "money_saved_total",
  "kill_reward_total",
  "cash_earned_total",
  "team_rounds_total",
] as const;

export const CLIENT_EVENT_FIELD_CATALOG = {
  player_death: [
    "tick",
    "round",
    "attacker",
    "attacker_steamid",
    "attacker_name",
    "user",
    "user_steamid",
    "user_name",
    "assister",
    "assister_steamid",
    "weapon",
    "weapon_name",
    "headshot",
    "attackerblind",
    "attackerinair",
    "assistedflash",
    "dominated",
    "revenge",
    "wipe",
    "distance",
    "noscope",
    "thrusmoke",
    "penetrated",
    "attacker_team",
    "user_team",
  ],
  player_hurt: [
    "tick",
    "round",
    "attacker",
    "user",
    "attacker_steamid",
    "user_steamid",
    "weapon",
    "weapon_name",
    "dmg_health",
    "dmg_armor",
    "health",
    "armor",
    "hitgroup",
    "attacker_team",
    "user_team",
    "penetrated",
    "thrusmoke",
    "noscope",
    "distance",
  ],
  player_blind: [
    "tick",
    "round",
    "attacker",
    "user",
    "attacker_steamid",
    "user_steamid",
    "blind_duration",
  ],
  round_start: ["tick", "round", "game_time", "round_start_time"],
  round_end: ["tick", "round", "winner", "winner_team", "reason", "game_time"],
  bomb: ["tick", "round", "user_steamid", "site", "X", "Y", "Z"],
  grenade: ["entity_id", "grenade_type", "grenade_name", "steamid", "tick", "X", "Y", "Z"],
} as const;

export const CLIENT_FIELD_AUDIT_CATALOG = [
  ...CLIENT_HEADER_FIELDS.map((field) => ({
    category: "HEADER",
    eventOrEntity: "header",
    field,
    source: "parseHeader" as const,
  })),
  ...CLIENT_TICK_PROPERTIES.map((field) => ({
    category: "PLAYERS",
    eventOrEntity: "tick_state",
    field,
    source: "parseTicks" as const,
  })),
  ...Object.entries(CLIENT_EVENT_FIELD_CATALOG).flatMap(([eventOrEntity, fields]) =>
    fields.map((field) => ({
      category:
        eventOrEntity === "bomb" ? "BOMB" : eventOrEntity === "grenade" ? "GRENADES" : "EVENTS",
      eventOrEntity,
      field,
      source: eventOrEntity === "grenade" ? ("parseGrenades" as const) : ("parseEvent" as const),
    })),
  ),
] as const;

export const CLIENT_PARITY_DIMENSIONS = [
  "header",
  "map",
  "version",
  "playback_ticks",
  "tickrate",
  "player_count",
  "player_identities",
  "event_inventory",
  "player_death_count",
  "player_hurt_count",
  "round_start_count",
  "round_end_count",
  "bomb_events",
  "grenade_events",
  "event_tick_ordering",
  "controlled_tick_values",
  "position",
  "health",
  "armor",
  "weapon",
  "economy",
  "round_boundaries",
] as const;

export type ClientParityDimension = (typeof CLIENT_PARITY_DIMENSIONS)[number];
export type ClientParityStatus = "PASS" | "FAIL" | "NOT_RUN" | "BLOCKED" | "NOT_AVAILABLE_ON_WASM";

export interface ClientFieldEvidence {
  field: string;
  observed: boolean;
  source: "parseHeader" | "parsePlayerInfo" | "parseEvent" | "parseTicks" | "parseGrenades";
  classification: ClientCapabilityClassification;
  value: unknown;
}

export function headerEvidence(header: Record<string, unknown>): ClientFieldEvidence[] {
  return CLIENT_HEADER_FIELDS.map((field) => ({
    field,
    observed: Object.prototype.hasOwnProperty.call(header, field),
    source: "parseHeader",
    classification: Object.prototype.hasOwnProperty.call(header, field)
      ? ("RAW_ONLY" as const)
      : ("NOT_PRESENT" as const),
    value: Object.prototype.hasOwnProperty.call(header, field) ? header[field] : null,
  }));
}

export const CLIENT_AUDIT_CATALOG_DIGEST = sha256Text(
  stableClientJson({
    headerFields: CLIENT_HEADER_FIELDS,
    events: CLIENT_EVENT_CATALOG,
    tickProperties: CLIENT_TICK_PROPERTIES,
    parityDimensions: CLIENT_PARITY_DIMENSIONS,
    fieldAuditCatalog: CLIENT_FIELD_AUDIT_CATALOG,
  }),
);

export const CLIENT_PARSER_CONTRACT_DIGEST = sha256Text(
  stableClientJson({
    contractVersion: 3,
    maxDemoBytes: 128 * 1024 * 1024,
    maxResultBytes: 2 * 1024 * 1024,
    maxEventSamples: 1_000,
    maxEventInventory: 1_024,
    maxPlayers: 128,
    maxTickProbe: 4_096,
    auditCatalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
    canonicalAdmission: "BLOCKED",
    persisted: false,
  }),
);
