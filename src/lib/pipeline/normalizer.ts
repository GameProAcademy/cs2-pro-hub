/**
 * Normalizer: RawParserOutput -> CanonicalMatch.
 *
 * Pure, deterministic and dependency-free so it can be unit tested without a
 * parser, a database or a network. The database never sees parser-internal
 * field names.
 */
import { MIN_VALID_ROUNDS, SCHEMA_VERSION } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import type {
  CanonicalEvent,
  CanonicalEventType,
  CanonicalMatch,
  CanonicalPlayer,
  CanonicalRound,
  ExtractionQuality,
  QualityFlag,
  RawParserEvent,
  RawParserOutput,
  Side,
} from "@/lib/pipeline/types";

const EVENT_TYPES: ReadonlySet<string> = new Set<CanonicalEventType>([
  "kill",
  "death",
  "assist",
  "damage",
  "flash",
  "smoke",
  "molotov",
  "incendiary",
  "he",
  "bomb_plant",
  "bomb_defuse",
  "bomb_explode",
  "weapon_fire",
  "weapon_purchase",
  "round_start",
  "round_end",
]);

/** Parser aliases -> canonical event type. Extend here, nowhere else. */
const EVENT_ALIASES: Record<string, CanonicalEventType> = {
  player_death: "kill",
  player_hurt: "damage",
  player_blind: "flash",
  flashbang_detonate: "flash",
  smokegrenade_detonate: "smoke",
  molotov_detonate: "molotov",
  inferno_startburn: "incendiary",
  hegrenade_detonate: "he",
  bomb_planted: "bomb_plant",
  bomb_defused: "bomb_defuse",
  bomb_exploded: "bomb_explode",
  item_purchase: "weapon_purchase",
  round_officially_ended: "round_end",
};

function toSide(value: unknown): Side | null {
  const s = String(value ?? "").toUpperCase();
  if (s === "CT" || s === "COUNTER-TERRORIST" || s === "COUNTERTERRORIST") return "CT";
  if (s === "T" || s === "TERRORIST" || s === "TR") return "T";
  return null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * FASE 2.7 — NULL ≠ FALSE.
 *
 * `undefined` (the parser said nothing) becomes `null`, never `false`. Only an
 * explicit boolean from the parser is preserved as a boolean.
 */
function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}


function mapSides(raw: Record<string, string> | undefined): Record<string, Side> {
  const out: Record<string, Side> = {};
  for (const [steamId, value] of Object.entries(raw ?? {})) {
    const side = toSide(value);
    if (side) out[steamId] = side;
  }
  return out;
}

function normalizeEvent(raw: RawParserEvent): CanonicalEvent | null {
  const alias = EVENT_ALIASES[raw.type] ?? raw.type;
  if (!EVENT_TYPES.has(alias)) return null;
  const type = alias as CanonicalEventType;

  const data: Record<string, unknown> = {};
  if (raw.wallbang != null) data["wallbang"] = raw.wallbang;
  if (raw.penetration != null) data["penetration"] = raw.penetration;
  if (raw.noscope != null) data["noscope"] = raw.noscope;
  if (raw.blind != null) data["blind"] = raw.blind;
  if (raw.flash_duration != null) data["flash_duration"] = raw.flash_duration;
  if (raw.players_flashed != null) data["players_flashed"] = raw.players_flashed;
  if (raw.grenade_type != null) data["grenade_type"] = raw.grenade_type;
  if (raw.cost != null) data["cost"] = raw.cost;
  if (raw.armor_damage != null) data["armor_damage"] = raw.armor_damage;
  // Positions are stored only for the meaningful events (never per tick).
  if (raw.position) data["position"] = raw.position;
  if (raw.victim_position) data["victim_position"] = raw.victim_position;

  return {
    roundNumber: raw.round,
    type,
    tick: num(raw.tick),
    timeSeconds: num(raw.time_seconds),
    actorSteamId: raw.attacker ?? null,
    victimSteamId: raw.victim ?? null,
    assisterSteamId: raw.assister ?? null,
    weapon: raw.weapon ?? null,
    headshot: typeof raw.headshot === "boolean" ? raw.headshot : null,
    distance: num(raw.distance),
    damage: num(raw.damage),
    data,
  };
}

function assessQuality(
  players: CanonicalPlayer[],
  rounds: CanonicalRound[],
  events: CanonicalEvent[],
  unsupportedEvents: number,
  warnings: string[],
): ExtractionQuality {
  const flags = new Set<QualityFlag>();
  const roundsValid = rounds.filter((r) => r.winnerSide !== null || r.endTick !== null).length;

  if (players.length === 0) flags.add("missing_players");
  if (rounds.length === 0) flags.add("missing_rounds");
  if (roundsValid < rounds.length) flags.add("partial_parse");
  if (rounds.length > 0 && rounds.length < MIN_VALID_ROUNDS) flags.add("low_sample");
  if (unsupportedEvents > 0) flags.add("unsupported_event");
  if (!events.some((e) => e.data["position"] != null)) flags.add("missing_positions");
  if (!rounds.some((r) => Object.keys(r.moneyStart).length > 0)) flags.add("missing_economy");
  if (!events.some((e) => e.type === "flash" || e.type === "he" || e.type === "molotov")) {
    flags.add("missing_utility");
  }
  for (const warning of warnings) {
    if (warning.toLowerCase().includes("partial")) flags.add("partial_parse");
  }

  // Confidence starts at 1 and is reduced by every missing signal. It is a
  // transparency signal, not a marketing number.
  const penalties: Record<QualityFlag, number> = {
    missing_players: 0.4,
    missing_rounds: 0.4,
    missing_positions: 0.1,
    missing_economy: 0.1,
    missing_utility: 0.1,
    partial_parse: 0.2,
    unsupported_event: 0.05,
    low_sample: 0.15,
  };
  let confidence = 1;
  for (const flag of flags) confidence -= penalties[flag];
  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(3))));

  const partialParse = flags.has("partial_parse") || roundsValid < rounds.length;

  return {
    extractionConfidence: confidence,
    partialParse,
    roundsDetected: rounds.length,
    roundsValid,
    playersDetected: players.length,
    eventsDetected: events.length,
    flags: [...flags],
  };
}

export function normalizeParserOutput(raw: RawParserOutput): CanonicalMatch {
  if (raw.players.length === 0 && raw.rounds.length === 0) {
    throw new PipelineError("CORRUPTED_DEMO", "no players and no rounds");
  }

  const players: CanonicalPlayer[] = raw.players
    .filter((p) => typeof p.steam_id === "string" && p.steam_id.length > 0)
    .map((p) => ({
      steamId: p.steam_id,
      name: p.name ?? null,
      team: p.team ?? null,
      side: toSide(p.side),
    }));

  const rounds: CanonicalRound[] = [...raw.rounds]
    .filter((r) => Number.isInteger(r.number) && r.number > 0)
    .sort((a, b) => a.number - b.number)
    .map((r) => ({
      roundNumber: r.number,
      winnerTeam: r.winner_team ?? null,
      winnerSide: toSide(r.winner_side),
      startTick: num(r.start_tick),
      endTick: num(r.end_tick),
      durationSeconds: num(r.duration_seconds),
      bombPlanted: bool(r.bomb_planted),
      bombDefused: bool(r.bomb_defused),
      bombExploded: bool(r.bomb_exploded),

      moneyStart: r.money_start ?? {},
      moneyEnd: r.money_end ?? {},
      equipmentValue: r.equipment_value ?? {},
      sides: mapSides(r.sides),
    }));

  let unsupportedEvents = 0;
  const events: CanonicalEvent[] = [];
  for (const rawEvent of raw.events) {
    if (!Number.isInteger(rawEvent.round)) continue;
    const normalized = normalizeEvent(rawEvent);
    if (normalized) events.push(normalized);
    else unsupportedEvents += 1;
  }
  events.sort((a, b) => a.roundNumber - b.roundNumber || (a.tick ?? 0) - (b.tick ?? 0));

  return {
    map: raw.header.map ?? null,
    matchDate: raw.header.match_date ?? null,
    gameVersion: raw.header.game_version ?? null,
    durationSeconds: num(raw.header.duration_seconds),
    tickrate: num(raw.header.tickrate),
    teamA: raw.header.teams?.team_a ?? null,
    teamB: raw.header.teams?.team_b ?? null,
    scoreA: num(raw.header.score?.team_a),
    scoreB: num(raw.header.score?.team_b),
    players,
    rounds,
    events,
    quality: assessQuality(players, rounds, events, unsupportedEvents, raw.warnings ?? []),
    parser: {
      name: raw.parser.name,
      version: raw.parser.version,
      revision: raw.parser.revision ?? null,
    },
    schemaVersion: SCHEMA_VERSION,
  };
}

/** Buy context classification. Returns `unknown` when economy data is absent. */
export function classifyBuyContext(
  moneyStart: number | undefined,
  equipmentValue: number | undefined,
): CanonicalRound["sides"] extends never
  ? never
  : "full_buy" | "force_buy" | "half_buy" | "eco" | "save" | "unknown" {
  if (equipmentValue == null && moneyStart == null) return "unknown";
  const equip = equipmentValue ?? 0;
  if (equipmentValue == null) return "unknown";
  if (equip >= 4000) return "full_buy";
  if (equip >= 2500) return "half_buy";
  if (equip >= 1400) return "force_buy";
  if ((moneyStart ?? 0) >= 4000) return "save";
  return "eco";
}
