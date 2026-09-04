/**
 * FASE 2.2.1 — FACEIT -> canonical model mappers.
 *
 * Pure functions. Every field is optional at the source, so every mapped field
 * accepts `null`. ABSOLUTE RULE: a missing statistic stays `null`; it is never
 * turned into `0`, and nothing is ever estimated and presented as official.
 */
import type {
  FaceitHistoryItem,
  FaceitMatch,
  FaceitMatchStats,
  FaceitPlayer,
} from "./faceit.types";

export interface FaceitConnectionFields {
  external_id: string;
  external_username: string | null;
  profile_url: string | null;
  metadata: Record<string, unknown>;
}

export interface FaceitIdentityFields {
  external_id: string;
  username: string | null;
  profile_url: string | null;
}

export interface FaceitProfileView {
  playerId: string;
  nickname: string | null;
  faceitUrl: string | null;
  avatar: string | null;
  country: string | null;
  membershipType: string | null;
  steamId64: string | null;
  skillLevel: number | null;
  faceitElo: number | null;
  region: string | null;
  gamePlayerId: string | null;
  gamePlayerName: string | null;
  verified: boolean | null;
  activatedAt: string | null;
}

function faceitHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (!/(^|\.)faceit\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** CS2 game profile, resolved by the configured game id (default `cs2`). */
export function faceitGameProfile(player: FaceitPlayer, gameId: string) {
  const games = (player.games ?? {}) as Record<string, Record<string, unknown>>;
  const game = games[gameId] ?? games[gameId.toLowerCase()] ?? null;
  const read = (key: string): unknown => (game ? game[key] : undefined);
  const num = (key: string): number | null => {
    const raw = read(key);
    if (raw === null || raw === undefined || raw === "") return null;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const str = (key: string): string | null => {
    const raw = read(key);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  };
  return {
    present: game !== null,
    gamePlayerId: str("game_player_id"),
    gamePlayerName: str("game_player_name"),
    skillLevel: num("skill_level"),
    faceitElo: num("faceit_elo"),
    region: str("region"),
  };
}

export function mapFaceitPlayerToProfileView(
  player: FaceitPlayer,
  gameId: string,
): FaceitProfileView {
  const game = faceitGameProfile(player, gameId);
  return {
    playerId: player.player_id,
    nickname: player.nickname,
    faceitUrl: faceitHttpsUrl(player.faceit_url),
    avatar: player.avatar,
    country: player.country,
    membershipType: player.membership_type,
    steamId64: player.steam_id_64,
    skillLevel: game.skillLevel,
    faceitElo: game.faceitElo,
    region: game.region,
    gamePlayerId: game.gamePlayerId,
    gamePlayerName: game.gamePlayerName,
    verified: player.verified,
    activatedAt: player.activated_at,
  };
}

/**
 * Connection metadata is deliberately minimal and NON-SENSITIVE: provider,
 * game, source version and sync timestamp. No token, no secret, ever — the
 * recursive database guard would reject it anyway.
 */
export function mapFaceitPlayerToConnection(
  player: FaceitPlayer,
  gameId: string,
  sourceVersion: string,
): FaceitConnectionFields {
  const view = mapFaceitPlayerToProfileView(player, gameId);
  const metadata: Record<string, unknown> = {
    provider: "faceit",
    game: gameId,
    source_version: sourceVersion,
    synced_at: new Date().toISOString(),
    profile: {
      country: view.country,
      avatar: view.avatar,
      membership_type: view.membershipType,
      skill_level: view.skillLevel,
      faceit_elo: view.faceitElo,
      region: view.region,
      steam_id_64: view.steamId64,
      game_player_id: view.gamePlayerId,
      game_player_name: view.gamePlayerName,
      verified: view.verified,
    },
  };
  return {
    external_id: view.playerId,
    external_username: view.nickname,
    profile_url: view.faceitUrl,
    metadata,
  };
}

export function mapFaceitPlayerToIdentity(
  player: FaceitPlayer,
  gameId: string,
): FaceitIdentityFields {
  const view = mapFaceitPlayerToProfileView(player, gameId);
  return { external_id: view.playerId, username: view.nickname, profile_url: view.faceitUrl };
}

export type MatchResult = "win" | "loss" | "draw";

export interface CanonicalFaceitMatch {
  external_match_id: string;
  platform: "faceit";
  map: string | null;
  match_date: string | null;
  /** Series score when the match is a bo2/bo3 (maps won), rounds for a bo1. */
  score_player: number | null;
  score_opponent: number | null;
  result: MatchResult | null;
  /** ROUNDS ACTUALLY PLAYED. Never the number of maps won. `null` when unknown. */
  rounds: number | null;
  team_player: string | null;
  team_opponent: string | null;
  duration_seconds: number | null;
  source_fetched_at: string;
  source_version: string;
  metadata: Record<string, unknown>;
}

function epochToIso(value: number | null): string | null {
  if (value === null) return null;
  // FACEIT reports seconds; tolerate milliseconds without inventing a date.
  const ms = value > 1e12 ? value : value * 1000;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Finds the roster/team key that contains the player. Returns null if absent. */
function locatePlayerTeam(
  teams:
    | Record<
        string,
        {
          team_id?: string | null;
          nickname?: string | null;
          name?: string | null;
          roster?: Array<{ player_id?: string | null }> | null;
          players?: Array<{ player_id?: string | null }> | null;
        }
      >
    | null
    | undefined,
  playerId: string,
): { key: string; other: string | null } | null {
  if (!teams) return null;
  const keys = Object.keys(teams);
  for (const key of keys) {
    const team = teams[key];
    const roster = team?.roster ?? team?.players ?? [];
    if (roster.some((member) => member?.player_id === playerId)) {
      const other = keys.find((candidate) => candidate !== key) ?? null;
      return { key, other };
    }
  }
  return null;
}

export interface MapMatchInput {
  playerId: string;
  history?: FaceitHistoryItem | null;
  details?: FaceitMatch | null;
  sourceVersion: string;
  gameId: string;
  /**
   * Optional map name resolved from `/matches/{id}/stats` (`round_stats.Map`),
   * used only when match details do not expose a single decided map pick.
   */
  mapFromStats?: string | null;
}

/**
 * How many maps the series is composed of, according to FACEIT itself.
 * `best_of` is authoritative when present; `detailed_results` is the fallback.
 */
export function faceitSeriesShape(details: FaceitMatch | null | undefined): {
  bestOf: number | null;
  mapsPlayed: number | null;
  isSeries: boolean;
} {
  const bestOf =
    typeof details?.best_of === "number" && details.best_of > 0 ? details.best_of : null;
  const detailed = details?.detailed_results ?? null;
  const mapsPlayed = detailed ? detailed.length : null;
  const isSeries = (bestOf !== null && bestOf > 1) || (mapsPlayed !== null && mapsPlayed > 1);
  return { bestOf, mapsPlayed, isSeries };
}

/**
 * Rounds played, taken from `detailed_results[].factions[].score`, which is the
 * ONLY place FACEIT reports per-map round scores. Returns `null` unless every
 * map segment exposes both faction scores — a partial sum would be a lie.
 */
function roundsFromDetailedResults(
  details: FaceitMatch | null | undefined,
  ownKey: string | null,
  otherKey: string | null,
): { rounds: number | null; perMap: Array<{ player: number; opponent: number }> | null } {
  const detailed = details?.detailed_results ?? null;
  if (!detailed || detailed.length === 0 || !ownKey || !otherKey) {
    return { rounds: null, perMap: null };
  }
  const perMap: Array<{ player: number; opponent: number }> = [];
  for (const entry of detailed) {
    const factions = (entry.factions ?? null) as Record<string, { score?: number | null }> | null;
    const own = factions?.[ownKey]?.score;
    const other = factions?.[otherKey]?.score;
    if (typeof own !== "number" || typeof other !== "number") return { rounds: null, perMap: null };
    perMap.push({ player: own, opponent: other });
  }
  const rounds = perMap.reduce((acc, entry) => acc + entry.player + entry.opponent, 0);
  return { rounds, perMap };
}

/**
 * Map name, resolved from the fields FACEIT actually provides, in order:
 * a single decided vote pick, then the map reported by match stats.
 * NEVER invented: an undecided or multi-map series resolves to `null`.
 */
export function extractFaceitMap(
  details: FaceitMatch | null | undefined,
  mapFromStats?: string | null,
): string | null {
  const picks = (details?.voting?.map?.pick ?? []).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (picks.length === 1) return picks[0] ?? null;
  const fromStats =
    typeof mapFromStats === "string" && mapFromStats.length > 0 ? mapFromStats : null;
  if (fromStats) return fromStats;
  return null;
}

/**
 * Single map name reported by `/matches/{id}/stats`. Returns `null` when the
 * payload covers several distinct maps (a series has no single map).
 */
export function faceitMapFromStats(
  stats: FaceitMatchStats,
  matchId?: string | null,
): string | null {
  const names = new Set<string>();
  for (const round of stats.rounds ?? []) {
    if (matchId && round.match_id && round.match_id !== matchId) continue;
    const raw = round.round_stats?.["Map"];
    if (typeof raw === "string" && raw.length > 0) names.add(raw);
  }
  if (names.size !== 1) return null;
  return [...names][0] ?? null;
}

/**
 * Builds the canonical match row. Anything FACEIT does not expose stays `null`;
 * the score is only set when both team scores are actually present.
 *
 * SCORE vs ROUNDS: `results.score` is rounds for a bo1 but MAPS WON for a
 * bo2/bo3. `rounds` therefore only ever comes from per-map round scores, and is
 * `null` when FACEIT does not expose them. A 2-1 bo3 is never "3 rounds".
 */
export function mapFaceitMatchToMatch(input: MapMatchInput): CanonicalFaceitMatch | null {
  const matchId = input.details?.match_id ?? input.history?.match_id ?? null;
  if (!matchId) return null;

  const teams = input.details?.teams ?? input.history?.teams ?? null;
  const located = locatePlayerTeam(teams as never, input.playerId);
  const results = input.details?.results ?? input.history?.results ?? null;
  const score = (results?.score ?? null) as Record<string, number | null> | null;

  let scorePlayer: number | null = null;
  let scoreOpponent: number | null = null;
  if (score && located) {
    const own = score[located.key];
    const other = located.other ? score[located.other] : null;
    scorePlayer = typeof own === "number" ? own : null;
    scoreOpponent = typeof other === "number" ? other : null;
  }

  let result: MatchResult | null = null;
  if (results?.winner && located) {
    result = results.winner === located.key ? "win" : "loss";
  } else if (scorePlayer !== null && scoreOpponent !== null) {
    result = scorePlayer === scoreOpponent ? "draw" : scorePlayer > scoreOpponent ? "win" : "loss";
  }

  const series = faceitSeriesShape(input.details);
  const detailedRounds = roundsFromDetailedResults(
    input.details,
    located?.key ?? null,
    located?.other ?? null,
  );

  // Rounds priority: real per-map round scores; then, for a single-map match
  // ONLY, the match score (which is the round score in a bo1). Never for series.
  let rounds: number | null = detailedRounds.rounds;
  let roundsSource: "detailed_results" | "match_score" | null =
    detailedRounds.rounds === null ? null : "detailed_results";
  if (rounds === null && !series.isSeries && scorePlayer !== null && scoreOpponent !== null) {
    rounds = scorePlayer + scoreOpponent;
    roundsSource = "match_score";
  }

  const startedAt = epochToIso(input.details?.started_at ?? input.history?.started_at ?? null);
  const finishedAt = epochToIso(input.details?.finished_at ?? input.history?.finished_at ?? null);
  const startedRaw = input.details?.started_at ?? input.history?.started_at ?? null;
  const finishedRaw = input.details?.finished_at ?? input.history?.finished_at ?? null;
  const duration =
    startedRaw !== null && finishedRaw !== null && finishedRaw > startedRaw
      ? Math.round(finishedRaw - startedRaw)
      : null;

  const teamRecord = (teams ?? {}) as Record<
    string,
    { nickname?: string | null; name?: string | null }
  >;
  const teamPlayer = located
    ? (teamRecord[located.key]?.nickname ?? teamRecord[located.key]?.name ?? null)
    : null;
  const teamOpponent = located?.other
    ? (teamRecord[located.other]?.nickname ?? teamRecord[located.other]?.name ?? null)
    : null;

  // A multi-map series has no single map: keep `null` and record the segments.
  const map = series.isSeries ? null : extractFaceitMap(input.details, input.mapFromStats);

  return {
    external_match_id: matchId,
    platform: "faceit",
    map,
    match_date: finishedAt ?? startedAt,
    score_player: scorePlayer,
    score_opponent: scoreOpponent,
    result,
    rounds,
    team_player: teamPlayer,
    team_opponent: teamOpponent,
    duration_seconds: duration,
    source_fetched_at: new Date().toISOString(),
    source_version: input.sourceVersion,
    metadata: {
      provider: "faceit",
      game: input.details?.game ?? input.history?.game_id ?? input.gameId,
      region: input.details?.region ?? input.history?.region ?? null,
      competition: input.details?.competition_name ?? input.history?.competition_name ?? null,
      competition_type: input.details?.competition_type ?? input.history?.competition_type ?? null,
      faceit_url: input.details?.faceit_url ?? input.history?.faceit_url ?? null,
      status: input.details?.status ?? input.history?.status ?? null,
      best_of: series.bestOf,
      maps_played: series.mapsPlayed,
      is_series: series.isSeries,
      /** What `score_player`/`score_opponent` actually mean for this row. */
      score_unit: series.isSeries ? "maps" : "rounds",
      rounds_source: roundsSource,
      map_scores: detailedRounds.perMap,
      /**
       * Availability only — the demo URL itself is NEVER stored, fetched or
       * downloaded in this phase. FACEIT demos stay on FACEIT.
       */
      demo_available:
        input.details?.demo_url === undefined || input.details?.demo_url === null
          ? null
          : input.details.demo_url.length > 0,
      started_at: startedAt,
      finished_at: finishedAt,
    },
  };
}

export interface CanonicalFaceitMetrics {
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  adr: number | null;
  hs_percent: number | null;
  kast: number | null;
  rating: number | null;
  multi_kills: number | null;
  rounds_played: number | null;
}

function statNumber(
  stats: Record<string, string | number | boolean | null> | null | undefined,
  ...keys: string[]
): number | null {
  if (!stats) return null;
  for (const key of keys) {
    const raw = stats[key];
    if (raw === undefined || raw === null || raw === "" || typeof raw === "boolean") continue;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export interface FaceitPlayerRoundStats {
  /** `match_id` reported inside the round entry, when present. */
  matchId: string | null;
  roundsInEntry: number | null;
  stats: Record<string, string | number | boolean | null> | null;
}

/**
 * DETERMINISTIC SELECTION.
 *
 * The `rounds` array of `/matches/{id}/stats` is NOT "one entry per round of the
 * match": it is one entry per played map/segment. So we never take
 * `rounds[0]` blindly. Instead we collect EVERY entry that contains the target
 * player, matched exclusively by FACEIT `player_id` (never nickname), optionally
 * restricted to a given `match_id`, and in the order returned by FACEIT.
 */
export function selectFaceitPlayerRounds(
  stats: FaceitMatchStats,
  playerId: string,
  matchId?: string | null,
): FaceitPlayerRoundStats[] {
  const selected: FaceitPlayerRoundStats[] = [];
  for (const round of stats.rounds ?? []) {
    if (matchId && round.match_id && round.match_id !== matchId) continue;
    for (const team of round.teams ?? []) {
      for (const player of team.players ?? []) {
        if (typeof player.player_id !== "string") continue;
        if (player.player_id !== playerId) continue;
        selected.push({
          matchId: round.match_id ?? null,
          roundsInEntry: statNumber(round.round_stats, "Rounds"),
          stats: player.player_stats ?? null,
        });
      }
    }
  }
  return selected;
}

function sumOrNull(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((acc, value) => acc + value, 0);
}

/** Weighted mean; absent values are skipped, they are never treated as zero. */
function weightedMean(pairs: Array<[number | null, number]>): number | null {
  let weight = 0;
  let total = 0;
  for (const [value, w] of pairs) {
    if (value === null) continue;
    const effective = w > 0 ? w : 1;
    total += value * effective;
    weight += effective;
  }
  if (weight === 0) return null;
  return Math.round((total / weight) * 100) / 100;
}

/**
 * Maps FACEIT match stats onto `match_metrics` columns that FACEIT genuinely
 * reports. Demo-only signals (trades, economy, utility timing, positioning,
 * round events, features) are NOT produced here: FACEIT stats are not a demo.
 *
 * Multiple map segments (bo2/bo3) are aggregated deterministically: counters are
 * summed, ratios are averaged weighted by the rounds of each segment. A metric
 * FACEIT never reported stays `null`; a metric reported as `0` stays `0`.
 */
export function mapFaceitMatchStatsToMetrics(
  stats: FaceitMatchStats,
  playerId: string,
  matchId?: string | null,
): CanonicalFaceitMetrics | null {
  const entries = selectFaceitPlayerRounds(stats, playerId, matchId);
  if (entries.length === 0) return null;

  const weights = entries.map((entry) => entry.roundsInEntry ?? 1);
  const pick = (...keys: string[]) => entries.map((entry) => statNumber(entry.stats, ...keys));
  const ratio = (...keys: string[]) =>
    weightedMean(
      pick(...keys).map((value, index) => [value, weights[index] ?? 1] as [number | null, number]),
    );

  const quads = pick("Quadro Kills");
  const pentas = pick("Penta Kills");
  const multi =
    quads.some((v) => v !== null) || pentas.some((v) => v !== null)
      ? sumOrNull([...quads, ...pentas])
      : null;

  return {
    kills: sumOrNull(pick("Kills")),
    deaths: sumOrNull(pick("Deaths")),
    assists: sumOrNull(pick("Assists")),
    adr: ratio("ADR", "Average Damage per Round"),
    hs_percent: ratio("Headshots %"),
    kast: ratio("KAST", "KAST %"),
    rating: ratio("Rating", "Player Rating"),
    multi_kills: multi,
    rounds_played: sumOrNull(entries.map((entry) => entry.roundsInEntry)),
  };
}

/**
 * Lifetime/aggregate statistics — kept as a flat, non-sensitive numeric map.
 * `null` is preserved: FACEIT not reporting a metric is not the same as zero.
 */
export function mapFaceitLifetimeStats(
  lifetime: Record<string, string | number | boolean | null> | null | undefined,
): Record<string, number | null> | null {
  if (!lifetime) return null;
  const out: Record<string, number | null> = {};
  for (const [key, raw] of Object.entries(lifetime)) {
    if (typeof raw === "boolean") continue;
    if (raw === null || raw === undefined || raw === "") {
      out[key] = null;
      continue;
    }
    const parsed = typeof raw === "number" ? raw : Number(raw);
    out[key] = Number.isFinite(parsed) ? parsed : null;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** K/D only when both values exist and deaths > 0. Never invented. */
export function safeKdRatio(kills: number | null, deaths: number | null): number | null {
  if (kills === null || deaths === null || deaths <= 0) return null;
  return Math.round((kills / deaths) * 100) / 100;
}
