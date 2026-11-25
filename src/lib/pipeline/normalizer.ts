/**
 * Normalizer: RawParserOutput -> CanonicalMatch.
 *
 * Pure, deterministic and dependency-free so it can be unit tested without a
 * parser, a database or a network. The database never sees parser-internal
 * field names.
 */
import { confirmedSide, winnerEvidenceFromParser } from "@/lib/rounds/winnerEvidence";
import { MIN_VALID_ROUNDS, SCHEMA_VERSION } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import { hasUtilityEvidence } from "@/lib/pipeline/evidence";
import { hasRoundEndEvidence } from "@/lib/pipeline/roundEvidence";
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

function sourceParticipantKey(player: RawParserOutput["players"][number]): string | null {
  const participantKey = player.participant_key?.trim();
  if (participantKey) return participantKey;
  const steamId = player.steam_id?.trim();
  return steamId || null;
}

const STEAM_KEY = /^[0-9]{1,20}$/;
/** `{steamId: finite number}` with at least one entry, else null (never an empty or coerced map). */
function steamNumberMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    if (STEAM_KEY.test(k) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return Object.keys(out).length ? out : null;
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
  // PM3 (R5.8.30) — telemetry for duels/aim (module C) and utility (module D). Absent stays absent.
  if (typeof raw.hitgroup === "string" && raw.hitgroup) data["hitgroup"] = raw.hitgroup;
  if (typeof raw.health_after === "number" && Number.isFinite(raw.health_after))
    data["health_after"] = raw.health_after;
  if (typeof raw.thru_smoke === "boolean") data["thru_smoke"] = raw.thru_smoke;
  if (typeof raw.attacker_in_air === "boolean") data["attacker_in_air"] = raw.attacker_in_air;
  if (typeof raw.silenced === "boolean") data["silenced"] = raw.silenced;
  if (raw.detonation_position) data["detonation_position"] = raw.detonation_position;
  // PM4 (R5.8.31) — round_end facts for economy (module E) and round state (module F). Only
  // well-formed `{steamId: finite number}` maps are stored; anything else stays absent.
  if (type === "round_end") {
    const spent = steamNumberMap(raw.money_spent);
    if (spent) data["money_spent"] = spent;
    const gone = steamNumberMap(raw.disconnected);
    if (gone) data["disconnected"] = gone;
  }

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
    assistedFlash: typeof raw.assisted_flash === "boolean" ? raw.assisted_flash : null,
  };
}

function assessQuality(
  players: CanonicalPlayer[],
  rounds: CanonicalRound[],
  events: CanonicalEvent[],
  unsupportedEvents: number,
  warnings: string[],
  rawEvidence?: RawParserOutput["raw_evidence"],
): ExtractionQuality {
  const flags = new Set<QualityFlag>();
  // FASE 2.7.1E — the central round-end evidence rule (roundEvidence.ts), the
  // same one metrics and survival use. `winnerTeam` and `durationSeconds` count
  // as evidence too, and a numeric 0 is never read as absence.
  const roundsValid = rounds.filter((r) => hasRoundEndEvidence(r)).length;

  if (players.length === 0) flags.add("missing_players");
  if (rounds.length === 0) flags.add("missing_rounds");
  if (roundsValid < rounds.length) flags.add("partial_parse");
  if (rounds.length > 0 && rounds.length < MIN_VALID_ROUNDS) flags.add("low_sample");
  if (unsupportedEvents > 0) flags.add("unsupported_event");
  if (!events.some((e) => e.data["position"] != null)) flags.add("missing_positions");
  if (!rounds.some((r) => Object.keys(r.moneyStart).length > 0)) flags.add("missing_economy");
  // FASE 2.7.1 — one single definition of "utility evidence", shared with
  // `metricsAvailability()` (see src/lib/pipeline/evidence.ts). The two layers
  // can no longer classify the same observation differently.
  if (!hasUtilityEvidence(events)) {
    flags.add("missing_utility");
  }
  if (rawEvidence?.manifest.partial_parse === true) flags.add("partial_parse");
  // Contract-v1 synthetic fixtures predate RAW-EVIDENCE-01. Real ingestion is
  // fail-closed without the envelope; preserve their explicit legacy signal.
  if (!rawEvidence && warnings.some((warning) => warning.toLowerCase().includes("partial"))) {
    flags.add("partial_parse");
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
  let confidence = rawEvidence?.manifest.extraction_confidence;
  if (confidence == null) {
    confidence = 1;
    for (const flag of flags) confidence -= penalties[flag];
    confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(3))));
  }

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

  const players: CanonicalPlayer[] = raw.players.flatMap((player) => {
    const participantKey = sourceParticipantKey(player);
    if (!participantKey) return [];
    return [
      {
        participantKey,
        steamId: player.steam_id?.trim() || null,
        name: player.name ?? null,
        team: player.team ?? null,
        side: toSide(player.side),
      },
    ];
  });

  const rounds: CanonicalRound[] = [...raw.rounds]
    .filter((r) => Number.isInteger(r.number) && r.number > 0)
    .sort((a, b) => a.number - b.number)
    .map((r) => {
      // R-07 / O8: with evidence, the winner is the confirmed side and nothing else (never a source
      // picked in a conflict); a malformed evidence fails closed (no winner, no evidence); a parser
      // before the contract keeps its winner_side as before.
      const parsed = winnerEvidenceFromParser(r);
      const winnerEvidence = parsed.kind === "valid" ? parsed.evidence : null;
      const winnerSide =
        parsed.kind === "legacy"
          ? toSide(r.winner_side)
          : parsed.kind === "valid" && toSide(r.winner_side) === confirmedSide(parsed.evidence)
            ? confirmedSide(parsed.evidence)
            : null;
      return {
        roundNumber: r.number,
        winnerTeam: r.winner_team ?? null,
        winnerSide,
        winnerEvidence,
        startTick: num(r.start_tick),
        endTick: num(r.end_tick),
        freezeEndTick: num(r.freeze_end_tick),
        freezeEndTimeSeconds: num(r.freeze_end_time_seconds),
        durationSeconds: num(r.duration_seconds),
        bombPlanted: bool(r.bomb_planted),
        bombDefused: bool(r.bomb_defused),
        bombExploded: bool(r.bomb_exploded),

        moneyStart: r.money_start ?? {},
        moneyEnd: r.money_end ?? {},
        equipmentValue: r.equipment_value ?? {},
        sides: mapSides(r.sides),
      };
    });

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
    quality: assessQuality(
      players,
      rounds,
      events,
      unsupportedEvents,
      raw.warnings ?? [],
      raw.raw_evidence,
    ),
    parser: {
      name: raw.parser.name,
      version: raw.parser.version,
      revision: raw.parser.revision ?? null,
    },
    schemaVersion: SCHEMA_VERSION,
    hotSemanticData: raw.hot_semantic_data,
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
