/**
 * PM2 Fase 4.2.3 — death review read (`cs2.death-context.v1` + `cs2.death-rules.v1`).
 *
 * Read-only and RLS-scoped, same model as the spatial heatmap: every query runs with the signed-in
 * player's own Supabase session (`requireSupabaseAuth`); the service role is never used. A match id
 * that is not in the caller's own overview is never queried (IDOR: NOT_FOUND, identical to a match
 * that does not exist). The caller's participant comes from `match_participants`; the round roster
 * and all kills of the match are read only to derive counts (alive, trade, opening) — no other
 * player's identity, name or position is returned.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  buildDeathContexts,
  type DeathContext,
  type DeathContextInput,
  type KillEventRow,
  type MatchIntegrityRef,
  type Side,
  type Vec3,
} from "@/lib/diagnosis/deathContext";
import {
  aggregateDeathPatterns,
  DEATH_RULES,
  DEATH_RULES_VERSION,
  evaluateDeathRules,
  type PatternSummary,
  type RuleResult,
} from "@/lib/diagnosis/deathRules";
import { loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import type { OverviewMatch } from "@/lib/playerOverview";
import { mapSupport, readWorldPosition, worldToRadar, type RadarPoint } from "@/lib/spatial/maps";
import { ownParticipantKeys } from "@/lib/xray.functions";

/** Kill rows read per match; a CS2 match never has this many kills. Hitting it fails loudly. */
export const DEATH_KILLS_PER_MATCH_LIMIT = 1000;
/** Matches aggregated for recurring patterns (newest first). */
export const DEATH_PATTERN_MAX_MATCHES = 20;

export interface DeathReviewItem {
  context: DeathContext;
  rules: RuleResult[];
  /** Radar pixels on a VALIDATED map only; null otherwise (never a guessed point). */
  radar: { victim: RadarPoint | null; attacker: RadarPoint | null } | null;
  /** The caller's own feedback on this death, by rule id (`REVIEW` = the death as a whole). */
  feedback: Record<string, FeedbackVerdict>;
}

export const FEEDBACK_VERDICTS = ["USEFUL", "NOT_USEFUL", "INCORRECT"] as const;
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number];
/** Key of the feedback on the death review as a whole (stored as rule_id NULL). */
export const WHOLE_REVIEW = "REVIEW";

export interface DeathMatchOption {
  matchId: string;
  map: string | null;
  playedAt: string;
  dateSource: "played" | "processed";
}

export type DeathReviewResponse = { matches: DeathMatchOption[] } & (
  | { status: "EMPTY" }
  | { status: "NOT_FOUND" }
  | { status: "NO_PARTICIPANT"; matchId: string }
  | {
      status: "OK";
      matchId: string;
      map: string | null;
      mapSupport: "SUPPORTED" | "NOT_VALIDATED" | "UNKNOWN_MAP";
      rulesVersion: typeof DEATH_RULES_VERSION;
      integrity: MatchIntegrityRef | null;
      deaths: DeathReviewItem[];
    }
);

export interface DeathPatternsResponse {
  rulesVersion: typeof DEATH_RULES_VERSION;
  matches: number;
  deaths: number;
  /** ISO dates of the oldest and newest match in the sample (null when empty). */
  period: { from: string; to: string } | null;
  patterns: PatternSummary[];
}

export const deathReviewInput = z.object({ matchId: z.string().uuid().optional() }).strict();
/** Matches listed in the review selector (newest first). */
export const DEATH_REVIEW_MAX_MATCHES = 50;

export const getMatchDeathReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deathReviewInput.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<DeathReviewResponse> => {
    const overview = await loadPlayerOverview(context.supabase, context.userId);
    const own = [...overview.matches]
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, DEATH_REVIEW_MAX_MATCHES);
    const matches = own.map((m) => ({
      matchId: m.matchId,
      map: m.map,
      playedAt: m.playedAt,
      dateSource: m.dateSource,
    }));
    if (!own.length) return { matches, status: "EMPTY" };
    // A match id outside the caller's own overview is never queried (IDOR → NOT_FOUND).
    const match = data.matchId ? overview.matches.find((m) => m.matchId === data.matchId) : own[0];
    if (!match) return { matches, status: "NOT_FOUND" };
    const loaded = await loadDeathInputs(context.supabase, context.userId, [match]);
    const one = loaded[0];
    if (!one) return { matches, status: "NO_PARTICIPANT", matchId: match.matchId };
    const support = mapSupport(match.map);
    // Own feedback only (RLS death_feedback_select_own); stored apart, never changes a rule.
    const { data: fb, error: fbError } = await context.supabase
      .from("death_feedback")
      .select("round_event_id, rule_id, verdict")
      .eq("match_id", match.matchId);
    if (fbError) throw new Error(`DIAGNOSIS_FEEDBACK_READ_FAILED:${fbError.code ?? "unknown"}`);
    const feedback = feedbackByEvent(fb ?? []);
    const deaths = buildDeathContexts(one.input, one.participantKey).map((ctx) => ({
      context: ctx,
      rules: evaluateDeathRules(ctx),
      radar: radarFor(ctx, match.map),
      feedback: feedback.get(ctx.ref.eventId) ?? {},
    }));
    console.info(
      JSON.stringify({
        event: "death_review",
        version: DEATH_RULES_VERSION,
        support: support.status,
        deaths: deaths.length,
        withPosition: deaths.filter((d) => d.context.positions.victim.value !== null).length,
      }),
    );
    return {
      matches,
      status: "OK",
      matchId: match.matchId,
      map: match.map,
      mapSupport: support.status,
      rulesVersion: DEATH_RULES_VERSION,
      integrity: one.input.integrity,
      deaths,
    };
  });

export const getDeathPatterns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeathPatternsResponse> => {
    const overview = await loadPlayerOverview(context.supabase, context.userId);
    const recent = [...overview.matches]
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, DEATH_PATTERN_MAX_MATCHES);
    const loaded = recent.length
      ? await loadDeathInputs(context.supabase, context.userId, recent)
      : [];
    const contexts = loaded.flatMap((l) => buildDeathContexts(l.input, l.participantKey));
    const used = recent.filter((m) => loaded.some((l) => l.input.matchId === m.matchId));
    const dates = used.map((m) => m.playedAt).sort();
    return {
      rulesVersion: DEATH_RULES_VERSION,
      matches: used.length,
      deaths: contexts.length,
      period: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
      patterns: aggregateDeathPatterns(contexts),
    };
  });

export const deathFeedbackInput = z
  .object({
    matchId: z.string().uuid(),
    roundEventId: z.string().uuid(),
    ruleId: z.enum([WHOLE_REVIEW, ...DEATH_RULES.filter((r) => r.evaluate).map((r) => r.id)] as [
      string,
      ...string[],
    ]),
    verdict: z.enum(FEEDBACK_VERDICTS),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type DeathFeedbackInput = z.input<typeof deathFeedbackInput>;
export type DeathFeedbackResponse = { status: "SAVED" } | { status: "REFUSED" };

/**
 * Records (or replaces) the caller's opinion on one death or one rule signal. The row is written
 * under the caller's session: RLS only accepts a kill event whose victim is the caller's own
 * participant in that match, so a foreign event id is refused (REFUSED, no detail).
 */
export const submitDeathFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deathFeedbackInput.parse(input))
  .handler(async ({ context, data }): Promise<DeathFeedbackResponse> => {
    const rule = data.ruleId === WHOLE_REVIEW ? null : data.ruleId;
    const existing = context.supabase
      .from("death_feedback")
      .select("id")
      .eq("round_event_id", data.roundEventId)
      .eq("user_id", context.userId);
    const { data: rows, error } = await (rule === null
      ? existing.is("rule_id", null)
      : existing.eq("rule_id", rule));
    if (error) throw new Error(`DIAGNOSIS_FEEDBACK_READ_FAILED:${error.code ?? "unknown"}`);
    const note = data.note ? data.note : null;
    const write = rows?.[0]
      ? await context.supabase
          .from("death_feedback")
          .update({ verdict: data.verdict, note, rules_version: DEATH_RULES_VERSION })
          .eq("id", rows[0].id)
          .select("id")
      : await context.supabase
          .from("death_feedback")
          .insert({
            match_id: data.matchId,
            round_event_id: data.roundEventId,
            rule_id: rule,
            rules_version: DEATH_RULES_VERSION,
            verdict: data.verdict,
            note,
          })
          .select("id");
    // 42501: RLS refused (not the caller's own death). Never echo the database message.
    if (write.error?.code === "42501" || (!write.error && !write.data?.length))
      return { status: "REFUSED" };
    if (write.error)
      throw new Error(`DIAGNOSIS_FEEDBACK_WRITE_FAILED:${write.error.code ?? "unknown"}`);
    console.info(
      JSON.stringify({ event: "death_feedback", rule: data.ruleId, verdict: data.verdict }),
    );
    return { status: "SAVED" };
  });

/** Pure: own feedback rows grouped by event, keyed by rule id (`REVIEW` for the whole death). */
export function feedbackByEvent(
  rows: Array<{ round_event_id: string; rule_id: string | null; verdict: string }>,
): Map<string, Record<string, FeedbackVerdict>> {
  const out = new Map<string, Record<string, FeedbackVerdict>>();
  for (const r of rows) {
    if (!(FEEDBACK_VERDICTS as readonly string[]).includes(r.verdict)) continue;
    const entry = out.get(r.round_event_id) ?? {};
    entry[r.rule_id ?? WHOLE_REVIEW] = r.verdict as FeedbackVerdict;
    out.set(r.round_event_id, entry);
  }
  return out;
}

/** Pure: radar points for a death, only on a VALIDATED map and only for valid positions. */
export function radarFor(ctx: DeathContext, map: string | null): DeathReviewItem["radar"] {
  const support = mapSupport(map);
  if (support.status !== "SUPPORTED" || !ctx.positions.drawable) return null;
  const toPoint = (p: Vec3 | null) => {
    if (!p) return null;
    const r = worldToRadar(support.overview, p);
    return r.ok ? r.point : null;
  };
  return {
    victim: toPoint(ctx.positions.victim.value),
    attacker: toPoint(ctx.positions.attacker.value),
  };
}

/** Pure: the cs2.match-integrity.v1 reference carried by an overview match (null = pre-contract). */
export function integrityRef(match: Pick<OverviewMatch, "matchEnd">): MatchIntegrityRef | null {
  const end = match.matchEnd;
  if (!end) return null;
  return {
    status: end.endedBy === "SURRENDER" ? "MATCH_SURRENDER_COMPLETED" : "MATCH_COMPLETED",
    eligible: true,
    endedBy: end.endedBy,
    validRounds: end.validRounds,
  };
}

export interface DeathKillRow {
  id: string;
  round_number: number | null;
  tick: number | null;
  time_seconds: number | null;
  actor_steam_id: string | null;
  victim_steam_id: string | null;
  weapon: string | null;
  headshot: boolean | null;
  distance: number | null;
  position: unknown;
  victim_position: unknown;
  blind: unknown;
  wallbang: unknown;
}

const asSide = (v: string | null | undefined): Side | null => (v === "CT" || v === "T" ? v : null);
const asBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const asPos = (v: unknown): Vec3 | null => {
  const r = readWorldPosition(v);
  return r.ok ? r.position : null;
};
const asNum = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Pure: a selected kill row as death-context input (absent values stay absent). */
export function toKillEventRow(r: DeathKillRow): KillEventRow {
  return {
    id: r.id,
    roundNumber: r.round_number,
    tick: r.tick,
    timeSeconds: asNum(r.time_seconds),
    actor: r.actor_steam_id,
    victim: r.victim_steam_id,
    weapon: r.weapon,
    headshot: r.headshot,
    distance: asNum(r.distance),
    attackerPosition: asPos(r.position),
    victimPosition: asPos(r.victim_position),
    blind: asBool(r.blind),
    wallbang: asBool(r.wallbang),
  };
}

async function loadDeathInputs(
  supabase: SupabaseClient<Database>,
  userId: string,
  matches: OverviewMatch[],
): Promise<Array<{ participantKey: string; input: DeathContextInput }>> {
  const playerIds = await ownPlayerIds(supabase, userId, "DIAGNOSIS");
  if (!playerIds.length) return [];
  const keys = await ownParticipantKeys(
    supabase,
    playerIds,
    matches.map((m) => m.matchId),
  );
  const byId = new Map(matches.map((m) => [m.matchId, m]));
  return Promise.all(
    [...keys].map(async ([matchId, participantKey]) => {
      const match = byId.get(matchId)!;
      const [rounds, roundPlayers, kills, plants] = await Promise.all([
        supabase
          .from("match_rounds")
          .select("round_number, start_tick, end_tick, winner_side, win_reason")
          .eq("match_id", matchId),
        supabase
          .from("round_players")
          .select("round_number, participant_key, side")
          .eq("match_id", matchId),
        supabase
          .from("round_events")
          .select(
            "id, round_number, tick, time_seconds, actor_steam_id, victim_steam_id, weapon, headshot, distance, position:data->position, victim_position:data->victim_position, blind:data->blind, wallbang:data->wallbang",
          )
          .eq("match_id", matchId)
          .eq("event_type", "kill")
          .limit(DEATH_KILLS_PER_MATCH_LIMIT),
        supabase
          .from("round_events")
          .select("round_number, tick")
          .eq("match_id", matchId)
          .eq("event_type", "bomb_plant"),
      ]);
      const failed = rounds.error ?? roundPlayers.error ?? kills.error ?? plants.error;
      if (failed) throw new Error(`DIAGNOSIS_READ_FAILED:${failed.code ?? "unknown"}`);
      const killRows = (kills.data ?? []) as unknown as DeathKillRow[];
      if (killRows.length >= DEATH_KILLS_PER_MATCH_LIMIT) throw new Error("DIAGNOSIS_KILLS_LIMIT");
      const support = mapSupport(match.map).status;
      return {
        participantKey,
        input: {
          matchId,
          map: match.map,
          mapValidation: support === "SUPPORTED" ? "VALIDATED" : support,
          integrity: integrityRef(match),
          rounds: (rounds.data ?? []).map((r) => ({
            roundNumber: r.round_number,
            startTick: r.start_tick,
            endTick: r.end_tick,
            winnerSide: asSide(r.winner_side),
            winReason: r.win_reason,
          })),
          roundPlayers: (roundPlayers.data ?? []).map((p) => ({
            roundNumber: p.round_number,
            participantKey: p.participant_key,
            side: asSide(p.side),
          })),
          kills: killRows.map(toKillEventRow),
          objectives: (plants.data ?? []).map((p) => ({
            roundNumber: p.round_number,
            tick: p.tick,
            type: "bomb_plant" as const,
          })),
        } satisfies DeathContextInput,
      };
    }),
  );
}
