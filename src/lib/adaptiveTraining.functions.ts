/**
 * PM5 / Fase 4.2.9 — adaptive training server functions (module H).
 *
 * Evidence is read with the player's own session (RLS): Player DNA, the last 10 eligible matches
 * through `cs2.evolution.v1`, and the goals declared in the profile. Plans, versions and sessions
 * are written by the server (service role) with the owner taken from the session; the browser
 * only sends choices (horizon, availability, areas to drop, an explicit session result).
 * A plan never changes silently: a revision is proposed with its diff and saved only when the
 * player accepts it, as a new immutable version.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildEvolution } from "@/lib/evolution/evolution";
import { loadPlayerDna, loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import {
  AVAILABILITY_LIMITS,
  HORIZONS,
  PLAN_VERSION,
  adherence,
  buildPlan,
  computePriorities,
  diffPlans,
  type Horizon,
  type PlanContent,
  type PlanDiff,
  type PriorityResult,
} from "@/lib/training/adaptive";
import type { SkillArea } from "@/lib/training/exercises";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;
const DAY = 24 * 3600 * 1000;
const AREAS = [
  "aim",
  "dueling",
  "positioning",
  "survivability",
  "utility",
  "teamplay",
  "clutch",
  "decision_making",
  "economy",
  "consistency",
] as const;

async function admin(): Promise<AnyDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyDb;
}
const fail = (label: string, e: { code?: string } | null): never => {
  throw new Error(`TRAINING_${label}_FAILED:${e?.code ?? "unknown"}`);
};

/** Evidence of the caller, read with the caller's session. */
async function evidence(context: { supabase: unknown; userId: string }): Promise<PriorityResult> {
  const db = context.supabase as SupabaseClient<import("@/integrations/supabase/types").Database>;
  const playerIds = await ownPlayerIds(db, context.userId, "TRAINING");
  const [overview, { dna }, goals] = await Promise.all([
    loadPlayerOverview(db, context.userId),
    loadPlayerDna(db, context.userId),
    playerIds.length === 1
      ? db.from("player_profile_goals").select("goal_code").eq("player_id", playerIds[0]!)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (goals.error) fail("GOALS_READ", goals.error);
  const evolution = overview.matches.length
    ? buildEvolution(overview.matches, { window: 10, map: null, side: "ALL" })
    : null;
  return computePriorities(
    {
      state: dna.state === "EMPTY" ? "NO_DATA" : dna.state,
      matches: dna.matches,
      dimensions: dna.dimensions.map((d) => ({ dimension: d.dimension, value: d.value })),
    },
    evolution,
    (goals.data ?? []).map((g) => g.goal_code as string),
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const dayIndex = (start: string, iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);

export interface SessionView {
  id: string;
  version: number;
  index: number;
  scheduledOn: string;
  area: string;
  exerciseId: string;
  minutes: number;
  status: "PLANNED" | "DONE" | "SKIPPED" | "SUPERSEDED";
  durationMinutes: number | null;
  note: string | null;
  completedAt: string | null;
}

export interface PlanView {
  id: string;
  horizon: Horizon;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  startDate: string;
  endDate: string;
  pauseReason: string | null;
  activeVersion: number;
  content: PlanContent;
  sessions: SessionView[];
  adherence: { done: number; due: number; rate: number | null };
  nextReview: string | null;
  versions: Array<{ version: number; reason: string; createdAt: string; diff: PlanDiff | null }>;
}

export interface TrainingView {
  evidence: PriorityResult;
  plan: PlanView | null;
  history: Array<{
    id: string;
    horizon: number;
    status: string;
    startDate: string;
    closedAt: string | null;
  }>;
}

async function readPlan(db: AnyDb, row: Record<string, unknown>): Promise<PlanView> {
  const id = row["id"] as string;
  const [versions, sessions] = await Promise.all([
    db
      .from("adaptive_training_plan_versions")
      .select("version, reason, content, diff, created_at")
      .eq("plan_id", id)
      .order("version"),
    db
      .from("adaptive_training_sessions")
      .select(
        "id, version, session_index, scheduled_on, area, exercise_id, minutes, status, duration_minutes, note, completed_at",
      )
      .eq("plan_id", id)
      .neq("status", "SUPERSEDED")
      .order("scheduled_on")
      .limit(400),
  ]);
  if (versions.error) fail("VERSIONS_READ", versions.error);
  if (sessions.error) fail("SESSIONS_READ", sessions.error);
  const active = row["active_version"] as number;
  const current = (versions.data ?? []).find((v) => v.version === active);
  if (!current) throw new Error("TRAINING_VERSION_MISSING");
  const start = row["start_date"] as string;
  const horizon = row["horizon"] as Horizon;
  const list: SessionView[] = (sessions.data ?? []).map((s) => ({
    id: s.id as string,
    version: s.version as number,
    index: s.session_index as number,
    scheduledOn: s.scheduled_on as string,
    area: s.area as string,
    exerciseId: s.exercise_id as string,
    minutes: s.minutes as number,
    status: s.status as SessionView["status"],
    durationMinutes: (s.duration_minutes as number | null) ?? null,
    note: (s.note as string | null) ?? null,
    completedAt: (s.completed_at as string | null) ?? null,
  }));
  const today = dayIndex(start, todayIso());
  const content = current.content as PlanContent;
  return {
    id,
    horizon,
    status: row["status"] as PlanView["status"],
    startDate: start,
    endDate: addDays(start, horizon - 1),
    pauseReason: (row["pause_reason"] as string | null) ?? null,
    activeVersion: active,
    content,
    sessions: list,
    adherence: adherence(
      list
        .filter((s) => s.status !== "SUPERSEDED")
        .map((s) => ({
          status: s.status as "PLANNED" | "DONE" | "SKIPPED",
          day: dayIndex(start, s.scheduledOn),
        })),
      today,
    ),
    nextReview: (() => {
      const d = content.reviewDays.find((x) => x >= today);
      return d === undefined ? null : addDays(start, Math.min(d, horizon) - 1);
    })(),
    versions: (versions.data ?? []).map((v) => ({
      version: v.version as number,
      reason: v.reason as string,
      createdAt: v.created_at as string,
      diff: (v.diff as PlanDiff | null) ?? null,
    })),
  };
}

export const getAdaptiveTraining = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrainingView> => {
    const db = context.supabase as unknown as AnyDb;
    const [ev, plans] = await Promise.all([
      evidence(context),
      db
        .from("adaptive_training_plans")
        .select("id, horizon, status, active_version, start_date, pause_reason, closed_at")
        .order("created_at", { ascending: false })
        .limit(11),
    ]);
    if (plans.error) fail("PLANS_READ", plans.error);
    const rows = (plans.data ?? []) as Record<string, unknown>[];
    const open = rows.find((r) => r["status"] === "ACTIVE" || r["status"] === "PAUSED");
    return {
      evidence: ev,
      plan: open ? await readPlan(db, open) : null,
      history: rows
        .filter((r) => r !== open)
        .slice(0, 10)
        .map((r) => ({
          id: r["id"] as string,
          horizon: r["horizon"] as number,
          status: r["status"] as string,
          startDate: r["start_date"] as string,
          closedAt: (r["closed_at"] as string | null) ?? null,
        })),
    };
  });

const availabilitySchema = {
  sessionsPerWeek: z
    .number()
    .int()
    .min(AVAILABILITY_LIMITS.minSessions)
    .max(AVAILABILITY_LIMITS.maxSessions),
  minutesPerSession: z
    .number()
    .int()
    .min(AVAILABILITY_LIMITS.minMinutes)
    .max(AVAILABILITY_LIMITS.maxMinutes),
};

export const createPlanInput = z
  .object({
    horizon: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    ...availabilitySchema,
    excludeAreas: z.array(z.enum(AREAS)).max(10).optional(),
  })
  .strict();

export type CreatePlanResult =
  | { status: "OK"; planId: string }
  | { status: "OPEN_PLAN_EXISTS" | "NO_EVIDENCE" | "INSUFFICIENT_SAMPLE" };

async function insertSessions(
  a: AnyDb,
  planId: string,
  userId: string,
  version: number,
  start: string,
  content: PlanContent,
  fromDay: number,
) {
  const rows = content.sessions
    .filter((s) => s.day >= fromDay)
    .map((s) => ({
      plan_id: planId,
      user_id: userId,
      version,
      session_index: s.index,
      scheduled_on: addDays(start, s.day),
      area: s.area,
      exercise_id: s.exerciseId,
      minutes: s.minutes,
    }));
  if (!rows.length) return;
  const { error } = await a.from("adaptive_training_sessions").insert(rows);
  if (error) fail("SESSIONS_WRITE", error);
}

export const createAdaptivePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createPlanInput.parse(input))
  .handler(async ({ context, data }): Promise<CreatePlanResult> => {
    const ev = await evidence(context);
    if (ev.state !== "READY") return { status: ev.state };
    const content = buildPlan(ev, data.horizon, data, { excludeAreas: data.excludeAreas ?? [] });
    if (!content) return { status: "NO_EVIDENCE" };
    const a = await admin();
    const start = todayIso();
    const plan = await a
      .from("adaptive_training_plans")
      .insert({ user_id: context.userId, horizon: data.horizon, start_date: start })
      .select("id")
      .single();
    // The partial unique index allows one open plan per user: a race returns 23505.
    if (plan.error)
      return plan.error.code === "23505"
        ? { status: "OPEN_PLAN_EXISTS" }
        : fail("PLAN_WRITE", plan.error);
    const planId = plan.data.id as string;
    const v = await a.from("adaptive_training_plan_versions").insert({
      plan_id: planId,
      user_id: context.userId,
      version: 1,
      reason: "CREATED",
      content,
      diff: null,
      method_version: PLAN_VERSION,
    });
    if (v.error) fail("VERSION_WRITE", v.error);
    await insertSessions(a, planId, context.userId, 1, start, content, 0);
    console.info(
      JSON.stringify({
        event: "training_plan_created",
        horizon: data.horizon,
        priorities: content.priorities.length,
        sessions: content.sessions.length,
      }),
    );
    return { status: "OK", planId };
  });

const revisionInput = z
  .object({
    planId: z.string().uuid(),
    basedOnVersion: z.number().int().min(1),
    reason: z.enum(["REVISION", "USER_EDIT"]),
    sessionsPerWeek: availabilitySchema.sessionsPerWeek.optional(),
    minutesPerSession: availabilitySchema.minutesPerSession.optional(),
    excludeAreas: z.array(z.enum(AREAS)).max(10).optional(),
  })
  .strict();

export type RevisionResult =
  | { status: "PROPOSAL"; diff: PlanDiff; proposal: PlanContent }
  | { status: "SAVED"; version: number; diff: PlanDiff }
  | { status: "NOT_FOUND" | "STALE" | "NO_EVIDENCE" | "INSUFFICIENT_SAMPLE" | "CLOSED" };

async function loadOpen(db: AnyDb, planId: string) {
  const r = await db
    .from("adaptive_training_plans")
    .select("id, horizon, status, active_version, start_date")
    .eq("id", planId)
    .maybeSingle();
  if (r.error) fail("PLAN_READ", r.error);
  return r.data as Record<string, unknown> | null;
}

async function revise(
  context: { supabase: unknown; userId: string },
  data: z.infer<typeof revisionInput>,
  save: boolean,
): Promise<RevisionResult> {
  const db = context.supabase as unknown as AnyDb;
  const plan = await loadOpen(db, data.planId); // RLS: only the caller's own plan is visible
  if (!plan) return { status: "NOT_FOUND" };
  if (plan["status"] !== "ACTIVE" && plan["status"] !== "PAUSED") return { status: "CLOSED" };
  if (plan["active_version"] !== data.basedOnVersion) return { status: "STALE" };
  const cur = await db
    .from("adaptive_training_plan_versions")
    .select("content")
    .eq("plan_id", data.planId)
    .eq("version", data.basedOnVersion)
    .single();
  if (cur.error || !cur.data) fail("VERSION_READ", cur.error);
  const current = (cur.data as { content: unknown }).content as PlanContent;
  const ev = await evidence(context);
  if (ev.state !== "READY") return { status: ev.state };
  const horizon = plan["horizon"] as Horizon;
  const proposal = buildPlan(
    ev,
    horizon,
    {
      sessionsPerWeek: data.sessionsPerWeek ?? current.availability.sessionsPerWeek,
      minutesPerSession: data.minutesPerSession ?? current.availability.minutesPerSession,
    },
    { excludeAreas: (data.excludeAreas ?? current.excludedByPlayer) as SkillArea[] },
  );
  if (!proposal) return { status: "NO_EVIDENCE" };
  const diff = diffPlans(current, proposal);
  if (!save) return { status: "PROPOSAL", diff, proposal };
  const a = await admin();
  const version = data.basedOnVersion + 1;
  // Optimistic concurrency: only the version the player saw can be replaced.
  const bump = await a
    .from("adaptive_training_plans")
    .update({ active_version: version, updated_at: new Date().toISOString() })
    .eq("id", data.planId)
    .eq("user_id", context.userId)
    .eq("active_version", data.basedOnVersion)
    .select("id");
  if (bump.error) fail("PLAN_WRITE", bump.error);
  if (!bump.data?.length) return { status: "STALE" };
  const v = await a.from("adaptive_training_plan_versions").insert({
    plan_id: data.planId,
    user_id: context.userId,
    version,
    reason: data.reason,
    content: proposal,
    diff,
    method_version: PLAN_VERSION,
  });
  if (v.error) fail("VERSION_WRITE", v.error);
  const start = plan["start_date"] as string;
  const today = todayIso();
  // Past and completed sessions stay; future planned sessions of the old version are superseded.
  const sup = await a
    .from("adaptive_training_sessions")
    .update({ status: "SUPERSEDED" })
    .eq("plan_id", data.planId)
    .eq("status", "PLANNED")
    .gte("scheduled_on", today);
  if (sup.error) fail("SESSIONS_WRITE", sup.error);
  await insertSessions(
    a,
    data.planId,
    context.userId,
    version,
    start,
    proposal,
    dayIndex(start, today),
  );
  console.info(
    JSON.stringify({
      event: "training_plan_revised",
      version,
      reason: data.reason,
      changed: diff.changed,
    }),
  );
  return { status: "SAVED", version, diff };
}

/** Shows what a revision would change (nothing is saved). */
export const proposeRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revisionInput.parse(input))
  .handler(({ context, data }) => revise(context, data, false));

/** Saves the revision the player accepted, as a new version. */
export const applyRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revisionInput.parse(input))
  .handler(({ context, data }) => revise(context, data, true));

export const setPlanStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]),
        reason: z.string().max(300).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ status: "OK" | "NOT_FOUND" | "CLOSED" }> => {
    const plan = await loadOpen(context.supabase as unknown as AnyDb, data.planId);
    if (!plan) return { status: "NOT_FOUND" };
    if (plan["status"] === "COMPLETED" || plan["status"] === "CANCELLED")
      return { status: "CLOSED" };
    const closing = data.status === "COMPLETED" || data.status === "CANCELLED";
    const a = await admin();
    const { error } = await a
      .from("adaptive_training_plans")
      .update({
        status: data.status,
        pause_reason: data.status === "PAUSED" ? (data.reason ?? null) : null,
        closed_at: closing ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.planId)
      .eq("user_id", context.userId);
    if (error) fail("PLAN_WRITE", error);
    return { status: "OK" };
  });

/** A session counts only through this explicit action (opening a page never marks it). */
export const logSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        status: z.enum(["DONE", "SKIPPED", "PLANNED"]),
        durationMinutes: z.number().int().min(1).max(300).optional(),
        note: z.string().max(500).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ status: "OK" | "NOT_FOUND" | "CLOSED" }> => {
    const db = context.supabase as unknown as AnyDb;
    const s = await db
      .from("adaptive_training_sessions")
      .select("id, plan_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (s.error) fail("SESSION_READ", s.error);
    if (!s.data || s.data.status === "SUPERSEDED") return { status: "NOT_FOUND" };
    const plan = await loadOpen(db, s.data.plan_id as string);
    if (!plan || plan["status"] !== "ACTIVE") return { status: "CLOSED" };
    const a = await admin();
    const { error } = await a
      .from("adaptive_training_sessions")
      .update({
        status: data.status,
        duration_minutes: data.status === "DONE" ? (data.durationMinutes ?? null) : null,
        note: data.note ?? null,
        completed_at: data.status === "DONE" ? new Date().toISOString() : null,
      })
      .eq("id", data.sessionId)
      .eq("user_id", context.userId);
    if (error) fail("SESSION_WRITE", error);
    return { status: "OK" };
  });

export { HORIZONS };
