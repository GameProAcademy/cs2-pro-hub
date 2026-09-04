/**
 * Gamers Club — canonical normalization.
 *
 * ABSOLUTE RULE: `null` means UNKNOWN. It is never replaced by `0`, and no
 * metric the source did not provide is ever fabricated.
 */
import { GAMERS_CLUB_PARSER_VERSION, GAMERS_CLUB_SOURCE_VERSION } from "./gamersclub.constants";

/** Reads a numeric field without inventing zeros. */
export function optionalNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function optionalIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  const text = optionalText(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export interface CanonicalGamersClubProfile {
  /** GCID, only when observed. */
  externalId: string | null;
  nickname: string | null;
  profileUrl: string | null;
  level: number | null;
  rank: string | null;
  country: string | null;
  /** The GC platform badge — NOT GamePro ownership proof. */
  sourceVerifiedAccount: boolean | null;
  matchesPlayed: number | null;
  wins: number | null;
  losses: number | null;
  modes: string[] | null;
  teams: string[] | null;
  medals: string[] | null;
  createdAt: string | null;
  observedAt: string;
  parserVersion: string;
  sourceVersion: string;
  /** 0..1 share of the fields we expected and actually obtained. */
  completeness: number;
}

const PROFILE_FIELDS = [
  "externalId",
  "nickname",
  "level",
  "rank",
  "country",
  "matchesPlayed",
  "wins",
  "losses",
] as const;

export function normalizeGamersClubProfile(
  raw: Record<string, unknown>,
  options: { profileUrl?: string | null; observedAt?: string } = {},
): CanonicalGamersClubProfile {
  const asStringArray = (value: unknown): string[] | null =>
    Array.isArray(value)
      ? value.map((entry) => optionalText(entry)).filter((entry): entry is string => entry !== null)
      : null;

  const externalIdRaw = optionalText(raw["id"]) ?? optionalText(raw["gcid"]);
  const externalId = externalIdRaw && /^[0-9]{1,12}$/.test(externalIdRaw) ? externalIdRaw : null;

  const profile: CanonicalGamersClubProfile = {
    externalId,
    nickname: optionalText(raw["nickname"]) ?? optionalText(raw["nick"]),
    profileUrl: options.profileUrl ?? optionalText(raw["profile_url"]),
    level: optionalNumber(raw["level"]),
    rank: optionalText(raw["rank"]),
    country: optionalText(raw["country"]),
    sourceVerifiedAccount:
      typeof raw["verified"] === "boolean" ? (raw["verified"] as boolean) : null,
    matchesPlayed: optionalNumber(raw["matches"]) ?? optionalNumber(raw["matches_played"]),
    wins: optionalNumber(raw["wins"]),
    losses: optionalNumber(raw["losses"]),
    modes: asStringArray(raw["modes"]),
    teams: asStringArray(raw["teams"]),
    medals: asStringArray(raw["medals"]),
    createdAt: optionalIsoDate(raw["created_at"]),
    observedAt: options.observedAt ?? new Date().toISOString(),
    parserVersion: GAMERS_CLUB_PARSER_VERSION,
    sourceVersion: GAMERS_CLUB_SOURCE_VERSION,
    completeness: 0,
  };

  const present = PROFILE_FIELDS.filter(
    (field) => profile[field] !== null && profile[field] !== undefined,
  ).length;
  profile.completeness = Number((present / PROFILE_FIELDS.length).toFixed(4));
  return profile;
}

/* ------------------------------------------------------------------ *
 * Canonical match model                                              *
 * ------------------------------------------------------------------ */

export type CanonicalMatchResult = "win" | "loss" | "draw" | "unknown" | "cancelled" | "aborted";

export interface CanonicalSourceMatch {
  source: "gamers_club";
  sourceMatchId: string;
  externalPlayerId: string | null;
  matchDate: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** Raw status text, normalized to lower case. */
  status: string | null;
  /** The match will not progress further (finished / cancelled / aborted). */
  terminal: boolean;
  /** There is positive evidence of completion. NOT implied by `matchDate`. */
  finished: boolean;
  /** Everything we expect from this source was obtained. Independent of `finished`. */
  sourceComplete: boolean;
  map: string | null;
  mode: string | null;
  competition: string | null;
  scorePlayer: number | null;
  scoreOpponent: number | null;
  rounds: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kast: number | null;
  adr: number | null;
  rating: number | null;
  result: CanonicalMatchResult;
  dataCompleteness: number;
}

const FINISHED_STATUSES = new Set(["finished", "closed", "complete", "completed"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);
const ABORTED_STATUSES = new Set(["aborted", "abandoned"]);

export function normalizeGamersClubMatchStatus(rawStatus: unknown, finishedAt: unknown) {
  const status = optionalText(rawStatus)?.toLowerCase() ?? null;
  const finishedAtIso = optionalIsoDate(finishedAt);
  const cancelled = status !== null && CANCELLED_STATUSES.has(status);
  const aborted = status !== null && ABORTED_STATUSES.has(status);
  // A match date proves scheduling, never completion.
  const finished = !cancelled && !aborted && (finishedAtIso !== null || (status !== null && FINISHED_STATUSES.has(status)));
  return { status, finishedAt: finishedAtIso, finished, cancelled, aborted, terminal: finished || cancelled || aborted };
}

const METRIC_FIELDS = [
  "map",
  "rounds",
  "kills",
  "deaths",
  "assists",
  "kast",
  "adr",
  "rating",
  "scorePlayer",
  "scoreOpponent",
] as const;

export function normalizeGamersClubMatch(
  raw: Record<string, unknown>,
  options: { externalPlayerId?: string | null } = {},
): CanonicalSourceMatch | null {
  const sourceMatchId = optionalText(raw["id"]) ?? optionalText(raw["match_id"]);
  if (!sourceMatchId) return null;

  const lifecycle = normalizeGamersClubMatchStatus(raw["status"], raw["finished_at"]);
  const scorePlayer = optionalNumber(raw["score_player"]);
  const scoreOpponent = optionalNumber(raw["score_opponent"]);

  let result: CanonicalMatchResult = "unknown";
  if (lifecycle.cancelled) result = "cancelled";
  else if (lifecycle.aborted) result = "aborted";
  else if (lifecycle.finished && scorePlayer !== null && scoreOpponent !== null) {
    result = scorePlayer > scoreOpponent ? "win" : scorePlayer < scoreOpponent ? "loss" : "draw";
  }

  const match: CanonicalSourceMatch = {
    source: "gamers_club",
    sourceMatchId,
    externalPlayerId: options.externalPlayerId ?? null,
    matchDate: optionalIsoDate(raw["match_date"]) ?? optionalIsoDate(raw["started_at"]),
    startedAt: optionalIsoDate(raw["started_at"]),
    finishedAt: lifecycle.finishedAt,
    status: lifecycle.status,
    terminal: lifecycle.terminal,
    finished: lifecycle.finished,
    /** Only a completed collection may flip this; normalization never does. */
    sourceComplete: false,
    map: optionalText(raw["map"]),
    mode: optionalText(raw["mode"]),
    competition: optionalText(raw["competition"]),
    scorePlayer,
    scoreOpponent,
    rounds: optionalNumber(raw["rounds"]),
    kills: optionalNumber(raw["kills"]),
    deaths: optionalNumber(raw["deaths"]),
    assists: optionalNumber(raw["assists"]),
    kast: optionalNumber(raw["kast"]),
    adr: optionalNumber(raw["adr"]),
    rating: optionalNumber(raw["rating"]),
    result,
    dataCompleteness: 0,
  };

  const present = METRIC_FIELDS.filter((field) => match[field] !== null).length;
  match.dataCompleteness = Number((present / METRIC_FIELDS.length).toFixed(4));
  return match;
}

/** Natural identity for idempotent ingestion. */
export function gamersClubMatchKey(match: CanonicalSourceMatch): string {
  return `${match.source}:${match.sourceMatchId}`;
}

/** Deduplicates by natural identity, keeping the first observation. */
export function dedupeGamersClubMatches(matches: CanonicalSourceMatch[]) {
  const seen = new Set<string>();
  const unique: CanonicalSourceMatch[] = [];
  let duplicates = 0;
  for (const match of matches) {
    const key = gamersClubMatchKey(match);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(match);
  }
  return { unique, duplicates };
}
