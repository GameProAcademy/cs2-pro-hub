/**
 * Fase 4 — pure construction of notification events from data that is ALREADY persisted
 * and verifiable (contract notification-v1). Nothing here writes; the server sends the
 * events to `notification_ingest`, which deduplicates by idempotency key, applies the
 * player's preferences and the volume cap atomically.
 *
 * Triggers (only these exist; each maps to a real row):
 *   analysis_ready    demo job `processed`, not superseded, with a match, identity resolved and
 *                     attached, and the match present in the player's own metrics.
 *   demo_failed       demo job `failed` and not superseded (final after the replacement
 *                     policy). `blocked_raw_audit` is a hold, not a final decision: no notice.
 *   evolution         the last N matches vs the N before them, same metric, both windows
 *                     complete (no null), N ≥ 5, and a difference larger than twice its
 *                     standard error (Welch). Otherwise nothing is said.
 *   goal_reached      a player-defined goal met by the mean of its last `window` matches,
 *                     all measured; recorded once as an achievement.
 *   goal_reminder     weekly, on the weekday the player chose (UTC), once per ISO week.
 * Null is never zero: a match without the metric does not count towards any window.
 */
export const NOTIFICATION_CONTRACT = "notification-v1";
/** Only recent source rows are considered (no flood of history on first use). */
export const NOTIFICATION_LOOKBACK_DAYS = 14;
export const EVOLUTION_WINDOW = 5;

export type NotificationCategory =
  | "demo_processing"
  | "analysis_ready"
  | "evolution"
  | "training"
  | "coach"
  | "account_security"
  | "operational";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "demo_processing",
  "analysis_ready",
  "evolution",
  "training",
  "coach",
  "account_security",
  "operational",
];

export interface NotificationEvent {
  type: string;
  version: 1;
  category: NotificationCategory;
  occurred_at: string;
  source: string;
  source_ref: string | null;
  payload: Record<string, unknown>;
  idempotency_key: string;
  link: string;
  params: Record<string, string | number>;
  achievement?: Record<string, unknown>;
}

export interface JobRow {
  id: string;
  status: string;
  match_id: string | null;
  finished_at: string | null;
  updated_at: string;
  superseded_by_job_id: string | null;
  identity_status: string | null;
  attachment_state: string | null;
  error_code: string | null;
}

/** A Steam link row (player_connections, source = steam), read under the caller's RLS. */
export interface ConnectionRow {
  id: string;
  source: string;
  status: string;
  connected_at: string | null;
  disconnected_at: string | null;
}

export interface MatchPoint {
  matchId: string;
  map: string | null;
  playedAt: string;
  kills: number | null;
  deaths: number | null;
  adr: number | null;
  kast: number | null;
  hsPercent: number | null;
  rating: number | null;
  firstKills: number | null;
  firstDeaths: number | null;
}

export type GoalMetric = "rating" | "adr" | "kast" | "hsPercent" | "kd" | "openingSuccess";
export const GOAL_METRICS: GoalMetric[] = [
  "rating",
  "adr",
  "kast",
  "hsPercent",
  "kd",
  "openingSuccess",
];

export interface Goal {
  id: string;
  playerId: string;
  metric: GoalMetric;
  direction: "AT_LEAST" | "AT_MOST";
  target: number;
  windowMatches: number;
  deadline: string | null;
  reminder: "OFF" | "WEEKLY";
  reminderWeekday: number | null;
}

/** Per-match value of a goal / evolution metric; null when not measured (never 0). */
export function metricValue(m: MatchPoint, metric: GoalMetric): number | null {
  switch (metric) {
    case "kd":
      return m.kills === null || m.deaths === null || m.deaths === 0 ? null : m.kills / m.deaths;
    case "openingSuccess": {
      if (m.firstKills === null || m.firstDeaths === null) return null;
      const duels = m.firstKills + m.firstDeaths;
      return duels === 0 ? null : (m.firstKills / duels) * 100;
    }
    default:
      return m[metric];
  }
}

const chronological = (ms: MatchPoint[]) =>
  [...ms].sort(
    (a, b) => a.playedAt.localeCompare(b.playedAt) || a.matchId.localeCompare(b.matchId),
  );

export interface GoalProgress {
  status: "NO_DATA" | "INSUFFICIENT_SAMPLE" | "IN_PROGRESS" | "REACHED";
  value: number | null;
  sample: number;
  window: number;
  periodFrom: string | null;
  periodTo: string | null;
  matchIds: string[];
}

/** The mean of the last `window` matches where the metric was MEASURED. */
export function goalProgress(goal: Goal, matches: MatchPoint[]): GoalProgress {
  const measured = chronological(matches)
    .map((m) => ({ m, v: metricValue(m, goal.metric) }))
    .filter((x): x is { m: MatchPoint; v: number } => x.v !== null);
  if (!measured.length)
    return {
      status: "NO_DATA",
      value: null,
      sample: 0,
      window: goal.windowMatches,
      periodFrom: null,
      periodTo: null,
      matchIds: [],
    };
  const last = measured.slice(-goal.windowMatches);
  const value = last.reduce((s, x) => s + x.v, 0) / last.length;
  const base = {
    value,
    sample: last.length,
    window: goal.windowMatches,
    periodFrom: last[0]!.m.playedAt,
    periodTo: last.at(-1)!.m.playedAt,
    matchIds: last.map((x) => x.m.matchId),
  };
  if (last.length < goal.windowMatches) return { status: "INSUFFICIENT_SAMPLE", ...base };
  const met = goal.direction === "AT_LEAST" ? value >= goal.target : value <= goal.target;
  return { status: met ? "REACHED" : "IN_PROGRESS", ...base };
}

export interface Evolution {
  metric: "rating" | "adr" | "kast";
  previous: number;
  recent: number;
  window: number;
  direction: "UP" | "DOWN";
  lastMatchId: string;
  periodFrom: string;
  periodTo: string;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => {
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
};

/**
 * Last `window` vs the `window` before, only when BOTH windows are fully measured and the
 * difference exceeds twice its (Welch) standard error. Returns null otherwise: no claim.
 */
export function evolutionOf(
  matches: MatchPoint[],
  metric: Evolution["metric"],
  window = EVOLUTION_WINDOW,
): Evolution | null {
  if (window < 5) return null;
  const ordered = chronological(matches);
  if (ordered.length < window * 2) return null;
  const recentMs = ordered.slice(-window);
  const previousMs = ordered.slice(-window * 2, -window);
  const recent = recentMs.map((m) => metricValue(m, metric));
  const previous = previousMs.map((m) => metricValue(m, metric));
  if (recent.some((v) => v === null) || previous.some((v) => v === null)) return null;
  const r = recent as number[];
  const p = previous as number[];
  const se = Math.sqrt(variance(r) / r.length + variance(p) / p.length);
  const diff = mean(r) - mean(p);
  if (!Number.isFinite(se) || se === 0 || Math.abs(diff) <= 2 * se) return null;
  return {
    metric,
    previous: mean(p),
    recent: mean(r),
    window,
    direction: diff > 0 ? "UP" : "DOWN",
    lastMatchId: recentMs.at(-1)!.matchId,
    periodFrom: previousMs[0]!.playedAt,
    periodTo: recentMs.at(-1)!.playedAt,
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** ISO week key (UTC), e.g. 2026-W45. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}

export function buildNotificationEvents(input: {
  now: Date;
  jobs: JobRow[];
  matches: MatchPoint[];
  goals: Goal[];
  /** Fase 4.0.1 — committed Steam links/unlinks (account & security, essential). */
  connections?: ConnectionRow[];
}): NotificationEvent[] {
  const { now } = input;
  const since = now.getTime() - NOTIFICATION_LOOKBACK_DAYS * 86_400_000;
  const known = new Set(input.matches.map((m) => m.matchId));
  const mapOf = new Map(input.matches.map((m) => [m.matchId, m.map ?? ""]));
  const events: NotificationEvent[] = [];
  const iso = (s: string | null, fallback: string) => s ?? fallback;

  for (const j of input.jobs) {
    if (j.superseded_by_job_id) continue; // a replaced attempt is history, not an outcome
    const at = iso(j.finished_at, j.updated_at);
    if (Date.parse(at) < since) continue;
    if (
      j.status === "processed" &&
      j.match_id &&
      j.identity_status === "resolved" &&
      j.attachment_state === "attached" &&
      known.has(j.match_id)
    ) {
      events.push({
        type: "analysis_ready",
        version: 1,
        category: "analysis_ready",
        occurred_at: at,
        source: "demo_jobs",
        source_ref: j.id,
        payload: { match: j.match_id },
        idempotency_key: `demo_job:${j.id}:processed`,
        link: "/analysis",
        params: { map: mapOf.get(j.match_id) ?? "" },
      });
    } else if (j.status === "failed") {
      events.push({
        type: "demo_failed",
        version: 1,
        category: "demo_processing",
        occurred_at: at,
        source: "demo_jobs",
        source_ref: j.id,
        payload: { code: (j.error_code ?? "UNKNOWN").slice(0, 64) },
        idempotency_key: `demo_job:${j.id}:failed`,
        link: "/upload",
        params: {},
      });
    }
  }

  // Account & security (essential): only COMMITTED Steam links / unlinks. A pending, expired
  // or failed attempt never produces a notice. Keyed by the connection and its own instant,
  // so a retry or a later sync never duplicates it, and a re-link later is a new event.
  for (const c of input.connections ?? []) {
    if (c.source !== "steam") continue;
    const linked = c.status === "connected" && c.connected_at;
    const unlinked = c.status === "disconnected" && c.disconnected_at;
    const at = linked ? c.connected_at! : unlinked ? c.disconnected_at! : null;
    if (!at || Date.parse(at) < since) continue;
    const type = linked ? "steam_linked" : "steam_unlinked";
    events.push({
      type,
      version: 1,
      category: "account_security",
      occurred_at: at,
      source: "player_connections",
      source_ref: c.id,
      payload: {},
      idempotency_key: `${type}:${c.id}:${Date.parse(at)}`,
      link: "/profile",
      params: {},
    });
  }

  // Evolution: at most one notice per metric per newest match (idempotent).
  for (const metric of ["rating", "adr", "kast"] as const) {
    const evo = evolutionOf(input.matches, metric);
    if (!evo) continue;
    events.push({
      type: "evolution",
      version: 1,
      category: "evolution",
      occurred_at: evo.periodTo,
      source: "match_metrics",
      source_ref: evo.lastMatchId,
      payload: { metric, window: evo.window },
      idempotency_key: `evolution:${metric}:${evo.lastMatchId}`,
      link: "/performance",
      params: {
        metric,
        direction: evo.direction,
        previous: round2(evo.previous),
        recent: round2(evo.recent),
        window: evo.window,
      },
    });
  }

  for (const g of input.goals) {
    const p = goalProgress(g, input.matches);
    if (p.status === "REACHED" && p.value !== null) {
      const dedupe = `${g.metric}:${g.direction}:${g.target}:${g.windowMatches}`;
      events.push({
        type: "goal_reached",
        version: 1,
        category: "training",
        occurred_at: p.periodTo!,
        source: "player_goals",
        source_ref: g.id,
        payload: { goal: g.id },
        idempotency_key: `goal:${g.id}:${dedupe}`,
        link: "/goals",
        params: { metric: g.metric, target: g.target, value: round2(p.value), window: p.window },
        achievement: {
          player_id: g.playerId,
          goal_id: g.id,
          dedupe_key: dedupe,
          metric: g.metric,
          direction: g.direction,
          target: g.target,
          achieved_value: round2(p.value),
          window_matches: g.windowMatches,
          sample_matches: p.sample,
          period_from: p.periodFrom,
          period_to: p.periodTo,
          evidence: { matches: p.matchIds },
        },
      });
    }
    if (
      g.reminder === "WEEKLY" &&
      g.reminderWeekday === now.getUTCDay() &&
      p.status !== "REACHED"
    ) {
      events.push({
        type: "goal_reminder",
        version: 1,
        category: "training",
        occurred_at: now.toISOString(),
        source: "player_goals",
        source_ref: g.id,
        payload: { goal: g.id },
        idempotency_key: `goal_reminder:${g.id}:${isoWeek(now)}`,
        link: "/goals",
        params: { metric: g.metric, target: g.target },
      });
    }
  }
  return events.slice(0, 50);
}
