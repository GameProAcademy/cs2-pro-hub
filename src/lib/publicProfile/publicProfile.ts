/**
 * VGL 5.0 — public player profile (pure). Builds the ONLY shape a public profile may expose:
 * a whitelist of identity fields the player filled in plus the player's own computed numbers
 * (pro-score-v1, Player DNA, map-rank-v1, canonical aggregates, a short match summary).
 *
 * Never part of it: e-mail, auth data, internal ids (user / player / match / job ids), demo
 * files or URLs, Coach conversations, admin fields. A missing value is null, never 0.
 */
import { rankMaps, type MapRank } from "@/lib/maps/mapRanking";
import { pooledValue } from "@/lib/metrics/canonicalAggregate";
import type { RealPlayerDna } from "@/lib/playerDna";
import type { OverviewMatch } from "@/lib/playerOverview";
import type { ProScore } from "@/lib/proScore";
import { normalizeMapCode } from "@/lib/cs2/maps";

export const PUBLIC_PROFILE_VERSION = "public-profile-v1";
/** XXXXX-XXXXX over 2–9 and A–Z without I/O (the database CHECK is the same). */
export const PUBLIC_ID_RE = /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/;
export const PUBLIC_RECENT_MATCHES = 5;
/** Below this many matches a metric is shown but never declared better or worse. */
export const COMPARE_MIN_MATCHES = 3;

/** Accepts "abcde-fghjk", " ABCDEFGHJK " … → "ABCDE-FGHJK", or null when not an id. */
export function normalizePublicId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  if (compact.length !== 10) return null;
  const id = `${compact.slice(0, 5)}-${compact.slice(5)}`;
  return PUBLIC_ID_RE.test(id) ? id : null;
}

export interface PublicIdentityInput {
  publicId: string;
  nickname: string | null;
  country: string | null;
  platform: string | null;
  role: string | null;
  team: string | null;
  avatarUrl: string | null;
}

export interface PublicProfile {
  version: typeof PUBLIC_PROFILE_VERSION;
  identity: PublicIdentityInput;
  score: {
    state: ProScore["state"];
    value: number | null;
    confidence: ProScore["confidence"];
    matches: number;
    coverage: number;
  };
  dna: {
    state: RealPlayerDna["state"];
    matches: number;
    dimensions: Array<{ dimension: string; value: number | null }>;
  };
  maps: {
    best: Pick<MapRank, "map" | "matches" | "estimate" | "confidence"> | null;
    ranked: Array<Pick<MapRank, "map" | "tier" | "matches">>;
  };
  stats: {
    matches: number;
    rounds: number;
    kd: number | null;
    adr: number | null;
    kast: number | null;
    hsPercent: number | null;
    rating: number | null;
    winRate: number | null;
    decided: number;
  };
  recent: Array<{
    map: string | null;
    playedAt: string;
    result: "win" | "loss" | "draw" | null;
    kills: number | null;
    deaths: number | null;
    adr: number | null;
    rating: number | null;
  }>;
}

const clean = (v: string | null | undefined, max = 40): string | null => {
  if (typeof v !== "string") return null;
  const s = v
    .split("")
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return s.length ? s : null;
};

export function buildPublicProfile(args: {
  identity: PublicIdentityInput;
  matches: ReadonlyArray<OverviewMatch>;
  score: ProScore;
  dna: RealPlayerDna;
}): PublicProfile {
  const { matches, score, dna } = args;
  const ranking = rankMaps(matches);
  const decided = matches.filter((m) => m.result === "win" || m.result === "loss");
  const rounds = matches.reduce((a, m) => a + (m.roundsPlayed ?? 0), 0);
  return {
    version: PUBLIC_PROFILE_VERSION,
    identity: {
      publicId: args.identity.publicId,
      nickname: clean(args.identity.nickname, 32),
      country: clean(args.identity.country, 56),
      platform: clean(args.identity.platform, 32),
      role: clean(args.identity.role, 32),
      team: clean(args.identity.team, 48),
      avatarUrl: args.identity.avatarUrl,
    },
    score: {
      state: score.state,
      value: score.state === "READY" ? score.score : null,
      confidence: score.state === "READY" ? score.confidence : null,
      matches: score.matches,
      coverage: score.coverage,
    },
    dna: {
      state: dna.state,
      matches: dna.matches,
      dimensions: dna.dimensions.map((d) => ({
        dimension: d.dimension,
        value: dna.state === "READY" && d.value !== null ? Math.round(d.value * 100) : null,
      })),
    },
    maps: {
      best: ranking.best
        ? {
            map: ranking.best.map,
            matches: ranking.best.matches,
            estimate: ranking.best.estimate,
            confidence: ranking.best.confidence,
          }
        : null,
      ranked: ranking.maps
        .filter((m) => m.position !== null)
        .map((m) => ({ map: m.map, tier: m.tier, matches: m.matches })),
    },
    stats: {
      matches: matches.length,
      rounds,
      kd: pooledValue(matches, "kd").value,
      adr: pooledValue(matches, "adr").value,
      kast: pooledValue(matches, "kast").value,
      hsPercent: pooledValue(matches, "hsPercent").value,
      rating: pooledValue(matches, "rating").value,
      winRate: decided.length
        ? decided.filter((m) => m.result === "win").length / decided.length
        : null,
      decided: decided.length,
    },
    recent: [...matches]
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, PUBLIC_RECENT_MATCHES)
      .map((m) => ({
        map: normalizeMapCode(m.map) ?? null,
        playedAt: m.playedAt,
        result: m.result,
        kills: m.kills,
        deaths: m.deaths,
        adr: m.adr,
        rating: m.rating,
      })),
  };
}

export type CompareVerdict = "A" | "B" | "EVEN" | "NOT_COMPARABLE";

export interface CompareRow {
  key: "score" | "rating" | "adr" | "kast" | "kd" | "hsPercent" | "winRate";
  a: number | null;
  b: number | null;
  verdict: CompareVerdict;
}

/** Relative gap below which two values are "even" (noise of small samples). */
const EVEN_GAP: Record<CompareRow["key"], number> = {
  score: 2,
  rating: 0.03,
  adr: 3,
  kast: 2,
  kd: 0.05,
  hsPercent: 2,
  winRate: 0.05,
};

/**
 * Side-by-side comparison of two public profiles on the same scales and the same definitions.
 * A value missing on either side, or a profile below COMPARE_MIN_MATCHES (or without a READY
 * Score for the Score row), is NOT_COMPARABLE: nobody is declared better on thin data.
 * HS% is shown for context but never ranked (it describes style, not output).
 */
export function comparePublicProfiles(a: PublicProfile, b: PublicProfile): CompareRow[] {
  const rows: Array<[CompareRow["key"], number | null, number | null, boolean]> = [
    ["score", a.score.value, b.score.value, true],
    ["rating", a.stats.rating, b.stats.rating, true],
    ["adr", a.stats.adr, b.stats.adr, true],
    ["kast", a.stats.kast, b.stats.kast, true],
    ["kd", a.stats.kd, b.stats.kd, true],
    ["winRate", a.stats.winRate, b.stats.winRate, true],
    ["hsPercent", a.stats.hsPercent, b.stats.hsPercent, false],
  ];
  const enough = (p: PublicProfile) => p.stats.matches >= COMPARE_MIN_MATCHES;
  return rows.map(([key, va, vb, ranked]) => {
    let verdict: CompareVerdict = "NOT_COMPARABLE";
    if (ranked && va !== null && vb !== null && enough(a) && enough(b)) {
      const gap = va - vb;
      verdict = Math.abs(gap) < EVEN_GAP[key] ? "EVEN" : gap > 0 ? "A" : "B";
    }
    return { key, a: va, b: vb, verdict };
  });
}
