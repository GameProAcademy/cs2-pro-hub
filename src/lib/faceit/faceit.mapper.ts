/**
 * FASE 2.2.1 — FACEIT -> canonical model mappers.
 *
 * Pure functions. Every field is optional at the source, so every mapped field
 * accepts `null`. ABSOLUTE RULE: a missing statistic stays `null`; it is never
 * turned into `0`, and nothing is ever estimated and presented as official.
 */
import type { FaceitHistoryItem, FaceitMatch, FaceitMatchStats, FaceitPlayer } from "./faceit.types";

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
  score_player: number | null;
  score_opponent: number | null;
  result: MatchResult | null;
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
  teams: Record<string, { team_id?: string | null; nickname?: string | null; name?: string | null; roster?: Array<{ player_id?: string | null }> | null; players?: Array<{ player_id?: string | null }> | null }> | null | undefined,
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
}

/**
 * Builds the canonical match row. Anything FACEIT does not expose stays `null`;
 * the score is only set when both team scores are actually present.
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

  const rounds =
    scorePlayer !== null && scoreOpponent !== null ? scorePlayer + scoreOpponent : null;

  const startedAt = epochToIso(input.details?.started_at ?? input.history?.started_at ?? null);
  const finishedAt = epochToIso(input.details?.finished_at ?? input.history?.finished_at ?? null);
  const startedRaw = input.details?.started_at ?? input.history?.started_at ?? null;
  const finishedRaw = input.details?.finished_at ?? input.history?.finished_at ?? null;
  const duration =
    startedRaw !== null && finishedRaw !== null && finishedRaw > startedRaw
      ? Math.round(finishedRaw - startedRaw)
      : null;

  const teamRecord = (teams ?? {}) as Record<string, { nickname?: string | null; name?: string | null }>;
  const teamPlayer = located ? (teamRecord[located.key]?.nickname ?? teamRecord[located.key]?.name ?? null) : null;
  const teamOpponent =
    located?.other ? (teamRecord[located.other]?.nickname ?? teamRecord[located.other]?.name ?? null) : null;

  const map = input.details?.voting?.map?.pick?.[0] ?? null;

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

/**
 * Maps FACEIT match stats onto `match_metrics` columns that FACEIT genuinely
 * reports. Demo-only signals (trades, economy, utility timing, positioning,
 * round events, features) are NOT produced here: FACEIT stats are not a demo.
 */
export function mapFaceitMatchStatsToMetrics(
  stats: FaceitMatchStats,
  playerId: string,
): CanonicalFaceitMetrics | null {
  for (const round of stats.rounds ?? []) {
    for (const team of round.teams ?? []) {
      for (const player of team.players ?? []) {
        if (player.player_id !== playerId) continue;
        const s = player.player_stats ?? null;
        const kills = statNumber(s, "Kills");
        const deaths = statNumber(s, "Deaths");
        const rounds = statNumber(round.round_stats, "Rounds");
        return {
          kills,
          deaths,
          assists: statNumber(s, "Assists"),
          adr: statNumber(s, "ADR", "Average Damage per Round"),
          hs_percent: statNumber(s, "Headshots %"),
          kast: statNumber(s, "KAST", "KAST %"),
          rating: statNumber(s, "Rating"),
          multi_kills: statNumber(s, "Penta Kills") !== null || statNumber(s, "Quadro Kills") !== null
            ? (statNumber(s, "Penta Kills") ?? 0) + (statNumber(s, "Quadro Kills") ?? 0)
            : null,
          rounds_played: rounds,
        };
      }
    }
  }
  return null;
}

/** K/D only when both values exist and deaths > 0. Never invented. */
export function safeKdRatio(kills: number | null, deaths: number | null): number | null {
  if (kills === null || deaths === null || deaths <= 0) return null;
  return Math.round((kills / deaths) * 100) / 100;
}
