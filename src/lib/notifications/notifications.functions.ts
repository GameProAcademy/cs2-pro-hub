/**
 * Fase 4 — notifications, preferences, goals and achievements (server functions).
 *
 * Identity always comes from the authenticated session (`requireSupabaseAuth`); the client
 * never sends a user or player id. Reads and the player's own writes (read state, deletion,
 * preferences, goals) use the caller's RLS-scoped client. Events, notifications and
 * achievements are written ONLY through `notification_ingest` with the service role, after
 * the server built the events from rows the caller can read (notificationEvents.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";

import {
  GOAL_METRICS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_LOOKBACK_DAYS,
  buildNotificationEvents,
  goalProgress,
  type Goal,
  type GoalMetric,
  type GoalProgress,
  type JobRow,
  type MatchPoint,
  type NotificationCategory,
} from "./notificationEvents";

type Db = SupabaseClient<Database>;
// The Fase 4 tables come from a manual migration and are not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const NOTIFICATION_PAGE_SIZE = 20;
const MAX_GOALS = 10;
/** Missing table (migration not applied yet): the feature degrades to "unavailable". */
const MISSING = new Set(["42P01", "PGRST205", "PGRST202", "42883"]);

export interface NotificationView {
  id: string;
  category: NotificationCategory;
  type: string;
  params: Record<string, string | number>;
  link: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPage {
  available: boolean;
  items: NotificationView[];
  unread: number;
  nextCursor: string | null;
}

export interface NotificationPrefs {
  available: boolean;
  categories: Record<Exclude<NotificationCategory, "account_security">, boolean>;
  pausedUntil: string | null;
  maxPerDay: number;
  emailEnabled: false;
}

const SWITCHABLE = NOTIFICATION_CATEGORIES.filter(
  (c): c is Exclude<NotificationCategory, "account_security"> => c !== "account_security",
);

// ------------------------------------------------------------------ pure validators
/** Cursor = "<created_at ISO>|<uuid>" (keyset pagination: no duplicates, no gaps). */
export function cursorFrom(value: unknown): { at: string; id: string } | null {
  if (typeof value !== "string") return null;
  const [at, id] = value.split("|");
  if (!at || !id || !UUID.test(id) || Number.isNaN(Date.parse(at))) return null;
  return { at, id };
}

export function listInputFrom(value: unknown): {
  category: NotificationCategory | null;
  cursor: { at: string; id: string } | null;
  unreadOnly: boolean;
} {
  const v = (value ?? {}) as Record<string, unknown>;
  const category = NOTIFICATION_CATEGORIES.includes(v["category"] as NotificationCategory)
    ? (v["category"] as NotificationCategory)
    : null;
  return { category, cursor: cursorFrom(v["cursor"]), unreadOnly: v["unreadOnly"] === true };
}

export function markInputFrom(
  value: unknown,
): { ok: true; ids: string[] | "ALL"; read: boolean } | { ok: false } {
  const v = (value ?? {}) as Record<string, unknown>;
  if (typeof v["read"] !== "boolean") return { ok: false };
  if (v["all"] === true) return { ok: true, ids: "ALL", read: v["read"] };
  const ids = v["ids"];
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 100 ||
    !ids.every((x) => typeof x === "string" && UUID.test(x))
  )
    return { ok: false };
  return { ok: true, ids: [...new Set(ids as string[])], read: v["read"] };
}

export function prefsInputFrom(value: unknown):
  | {
      ok: true;
      categories: NotificationPrefs["categories"];
      pauseHours: number | null;
      maxPerDay: number;
    }
  | { ok: false } {
  const v = (value ?? {}) as Record<string, unknown>;
  const cats = (v["categories"] ?? {}) as Record<string, unknown>;
  const categories = {} as NotificationPrefs["categories"];
  for (const c of SWITCHABLE) {
    if (typeof cats[c] !== "boolean") return { ok: false };
    categories[c] = cats[c] as boolean;
  }
  const pause = v["pauseHours"];
  if (pause !== null && pause !== 0 && pause !== 24 && pause !== 168) return { ok: false };
  const max = v["maxPerDay"];
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > 30)
    return { ok: false };
  return {
    ok: true,
    categories,
    pauseHours: pause === 0 ? null : (pause as number | null),
    maxPerDay: max,
  };
}

export function goalInputFrom(value: unknown):
  | {
      ok: true;
      id: string | null;
      metric: GoalMetric;
      direction: "AT_LEAST" | "AT_MOST";
      target: number;
      windowMatches: number;
      deadline: string | null;
      reminder: "OFF" | "WEEKLY";
      reminderWeekday: number | null;
    }
  | { ok: false } {
  const v = (value ?? {}) as Record<string, unknown>;
  const id = v["id"] === undefined || v["id"] === null ? null : v["id"];
  if (id !== null && (typeof id !== "string" || !UUID.test(id))) return { ok: false };
  if (!GOAL_METRICS.includes(v["metric"] as GoalMetric)) return { ok: false };
  if (v["direction"] !== "AT_LEAST" && v["direction"] !== "AT_MOST") return { ok: false };
  const target = v["target"];
  if (typeof target !== "number" || !Number.isFinite(target) || target < 0 || target > 1000)
    return { ok: false };
  const w = v["windowMatches"];
  if (typeof w !== "number" || !Number.isInteger(w) || w < 3 || w > 20) return { ok: false };
  const deadline = v["deadline"] ?? null;
  if (deadline !== null && (typeof deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)))
    return { ok: false };
  const reminder = v["reminder"] ?? "OFF";
  if (reminder !== "OFF" && reminder !== "WEEKLY") return { ok: false };
  const day = v["reminderWeekday"] ?? null;
  if (
    reminder === "WEEKLY" &&
    (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6)
  )
    return { ok: false };
  return {
    ok: true,
    id: id as string | null,
    metric: v["metric"] as GoalMetric,
    direction: v["direction"],
    target,
    windowMatches: w,
    deadline: deadline as string | null,
    reminder,
    reminderWeekday: reminder === "WEEKLY" ? (day as number) : null,
  };
}

// ------------------------------------------------------------------ helpers
function onePlayer(ids: string[]): string | null {
  return ids.length === 1 ? ids[0]! : null;
}

function view(row: Record<string, unknown>): NotificationView {
  return {
    id: row["id"] as string,
    category: row["category"] as NotificationCategory,
    type: row["type"] as string,
    params: (row["params"] ?? {}) as Record<string, string | number>,
    link: row["link"] as string,
    createdAt: row["created_at"] as string,
    readAt: (row["read_at"] as string | null) ?? null,
  };
}

function toGoal(row: Record<string, unknown>): Goal {
  return {
    id: row["id"] as string,
    playerId: row["player_id"] as string,
    metric: row["metric"] as GoalMetric,
    direction: row["direction"] as Goal["direction"],
    target: Number(row["target"]),
    windowMatches: row["window_matches"] as number,
    deadline: (row["deadline"] as string | null) ?? null,
    reminder: row["reminder"] as Goal["reminder"],
    reminderWeekday: (row["reminder_weekday"] as number | null) ?? null,
  };
}

async function loadGoals(
  db: AnyDb,
  playerId: string,
): Promise<{ available: boolean; goals: Goal[] }> {
  const { data, error } = await db
    .from("player_goals")
    .select(
      "id, player_id, metric, direction, target, window_matches, deadline, reminder, reminder_weekday, created_at",
    )
    .eq("player_id", playerId)
    .order("created_at", { ascending: true })
    .limit(MAX_GOALS);
  if (error) {
    if (MISSING.has(error.code ?? "")) return { available: false, goals: [] };
    throw new Error(`GOALS_READ_FAILED:${error.code ?? "unknown"}`);
  }
  return { available: true, goals: (data ?? []).map((r) => toGoal(r as Record<string, unknown>)) };
}

function matchPoints(overview: Awaited<ReturnType<typeof loadPlayerOverview>>): MatchPoint[] {
  return overview.matches.map((m) => ({
    matchId: m.matchId,
    map: m.map,
    playedAt: m.playedAt,
    kills: m.kills,
    deaths: m.deaths,
    adr: m.adr,
    kast: m.kast,
    hsPercent: m.hsPercent,
    rating: m.rating,
    firstKills: m.firstKills,
    firstDeaths: m.firstDeaths,
  }));
}

// ------------------------------------------------------------------ sync (event → notification)
/**
 * Builds the caller's events from their own persisted rows and ingests them atomically.
 * Safe to call often (the bell polls it): duplicates are ignored by the database.
 */
export const syncNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as Db;
    const playerId = onePlayer(await ownPlayerIds(db, context.userId, "COACH"));
    if (!playerId) return { ok: true as const, accepted: 0 };
    const since = new Date(Date.now() - NOTIFICATION_LOOKBACK_DAYS * 86_400_000).toISOString();
    const [{ data: jobs, error }, overview, goals] = await Promise.all([
      db
        .from("demo_jobs")
        .select(
          "id, status, match_id, finished_at, updated_at, superseded_by_job_id, identity_status, attachment_state, error_code",
        )
        .eq("user_id", context.userId)
        .in("status", ["processed", "failed"])
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(40),
      loadPlayerOverview(db, context.userId),
      loadGoals(db as AnyDb, playerId),
    ]);
    if (error) throw new Error(`NOTIFY_JOBS_READ_FAILED:${error.code ?? "unknown"}`);
    const events = buildNotificationEvents({
      now: new Date(),
      jobs: (jobs ?? []) as JobRow[],
      matches: matchPoints(overview),
      goals: goals.goals,
    });
    if (!events.length) return { ok: true as const, accepted: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error: ingestError } = await (supabaseAdmin as unknown as AnyDb).rpc(
      "notification_ingest",
      { p_user_id: context.userId, p_events: events },
    );
    if (ingestError) {
      if (MISSING.has(ingestError.code ?? "")) return { ok: true as const, accepted: 0 };
      throw new Error(`NOTIFY_INGEST_FAILED:${ingestError.code ?? "unknown"}`);
    }
    const row = (Array.isArray(data) ? data[0] : data) as { accepted: number } | null;
    // Retention runs bounded and occasionally (no new scheduler).
    if (Math.random() < 0.05)
      await (supabaseAdmin as unknown as AnyDb).rpc("notification_purge_expired", { p_limit: 500 });
    return { ok: true as const, accepted: row?.accepted ?? 0 };
  });

// ------------------------------------------------------------------ center
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInputFrom(input))
  .handler(async ({ context, data }): Promise<NotificationPage> => {
    const db = context.supabase as unknown as AnyDb;
    let query = db
      .from("notifications")
      .select("id, category, type, params, link, created_at, read_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(NOTIFICATION_PAGE_SIZE + 1);
    if (data.category) query = query.eq("category", data.category);
    if (data.unreadOnly) query = query.is("read_at", null);
    if (data.cursor)
      query = query.or(
        `created_at.lt.${data.cursor.at},and(created_at.eq.${data.cursor.at},id.lt.${data.cursor.id})`,
      );
    const [{ data: rows, error }, { count, error: countError }] = await Promise.all([
      query,
      db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("read_at", null),
    ]);
    const err = error ?? countError;
    if (err) {
      if (MISSING.has(err.code ?? ""))
        return { available: false, items: [], unread: 0, nextCursor: null };
      throw new Error(`NOTIFY_READ_FAILED:${err.code ?? "unknown"}`);
    }
    const page = (rows ?? [])
      .slice(0, NOTIFICATION_PAGE_SIZE)
      .map((r) => view(r as Record<string, unknown>));
    const more = (rows ?? []).length > NOTIFICATION_PAGE_SIZE;
    const last = page.at(-1);
    return {
      available: true,
      items: page,
      unread: count ?? 0,
      nextCursor: more && last ? `${last.createdAt}|${last.id}` : null,
    };
  });

export const markNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => markInputFrom(input))
  .handler(async ({ context, data }) => {
    if (!data.ok) return { ok: false as const };
    const db = context.supabase as unknown as AnyDb;
    let q = db
      .from("notifications")
      .update({ read_at: data.read ? new Date().toISOString() : null })
      .eq("user_id", context.userId);
    // Idempotent: marking read keeps the first read time.
    if (data.read) q = q.is("read_at", null);
    if (data.ids !== "ALL") q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw new Error(`NOTIFY_MARK_FAILED:${error.code ?? "unknown"}`);
    return { ok: true as const };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { id?: unknown } | null)?.id;
    return { id: typeof id === "string" && UUID.test(id) ? id : null };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) return { ok: false as const };
    const db = context.supabase as unknown as AnyDb;
    const { error } = await db
      .from("notifications")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(`NOTIFY_DELETE_FAILED:${error.code ?? "unknown"}`);
    return { ok: true as const };
  });

// ------------------------------------------------------------------ preferences
export const getNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPrefs> => {
    const db = context.supabase as unknown as AnyDb;
    const { data, error } = await db
      .from("notification_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    const defaults = Object.fromEntries(
      SWITCHABLE.map((c) => [c, true]),
    ) as NotificationPrefs["categories"];
    if (error) {
      if (MISSING.has(error.code ?? ""))
        return {
          available: false,
          categories: defaults,
          pausedUntil: null,
          maxPerDay: 10,
          emailEnabled: false,
        };
      throw new Error(`NOTIFY_PREFS_READ_FAILED:${error.code ?? "unknown"}`);
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      available: true,
      categories: Object.fromEntries(
        SWITCHABLE.map((c) => [c, typeof row[c] === "boolean" ? (row[c] as boolean) : true]),
      ) as NotificationPrefs["categories"],
      pausedUntil: (row["paused_until"] as string | null) ?? null,
      maxPerDay: (row["max_per_day"] as number | undefined) ?? 10,
      emailEnabled: false,
    };
  });

export const saveNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => prefsInputFrom(input))
  .handler(async ({ context, data }) => {
    if (!data.ok) return { ok: false as const };
    const db = context.supabase as unknown as AnyDb;
    const { error } = await db.from("notification_preferences").upsert(
      {
        user_id: context.userId,
        ...data.categories,
        paused_until: data.pauseHours
          ? new Date(Date.now() + data.pauseHours * 3_600_000).toISOString()
          : null,
        max_per_day: data.maxPerDay,
        // External channels stay OFF: no consent is collected or implied here.
        email_enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`NOTIFY_PREFS_WRITE_FAILED:${error.code ?? "unknown"}`);
    return { ok: true as const };
  });

// ------------------------------------------------------------------ goals and achievements
export interface GoalView extends Goal {
  progress: GoalProgress;
}

export interface AchievementView {
  id: string;
  metric: string;
  direction: string;
  target: number;
  achievedValue: number;
  windowMatches: number;
  sampleMatches: number;
  periodFrom: string;
  periodTo: string;
  achievedAt: string;
}

export const listGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as Db;
    const playerId = onePlayer(await ownPlayerIds(db, context.userId, "COACH"));
    if (!playerId)
      return {
        available: true,
        hasPlayer: false,
        goals: [] as GoalView[],
        achievements: [] as AchievementView[],
        updatedAt: new Date().toISOString(),
      };
    const [goals, overview] = await Promise.all([
      loadGoals(db as AnyDb, playerId),
      loadPlayerOverview(db, context.userId),
    ]);
    if (!goals.available)
      return {
        available: false,
        hasPlayer: true,
        goals: [] as GoalView[],
        achievements: [] as AchievementView[],
        updatedAt: new Date().toISOString(),
      };
    const points = matchPoints(overview);
    const { data: ach, error } = await (db as unknown as AnyDb)
      .from("player_achievements")
      .select(
        "id, metric, direction, target, achieved_value, window_matches, sample_matches, period_from, period_to, achieved_at",
      )
      .eq("player_id", playerId)
      .order("achieved_at", { ascending: false })
      .limit(50);
    if (error && !MISSING.has(error.code ?? ""))
      throw new Error(`ACHIEVEMENTS_READ_FAILED:${error.code ?? "unknown"}`);
    return {
      available: true,
      hasPlayer: true,
      goals: goals.goals.map((g) => ({ ...g, progress: goalProgress(g, points) })),
      achievements: (ach ?? []).map((r: Record<string, unknown>) => ({
        id: r["id"] as string,
        metric: r["metric"] as string,
        direction: r["direction"] as string,
        target: Number(r["target"]),
        achievedValue: Number(r["achieved_value"]),
        windowMatches: r["window_matches"] as number,
        sampleMatches: r["sample_matches"] as number,
        periodFrom: r["period_from"] as string,
        periodTo: r["period_to"] as string,
        achievedAt: r["achieved_at"] as string,
      })),
      updatedAt: new Date().toISOString(),
    };
  });

export const saveGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => goalInputFrom(input))
  .handler(async ({ context, data }) => {
    if (!data.ok) return { ok: false as const, error: "INVALID" as const };
    const db = context.supabase as Db;
    const playerId = onePlayer(await ownPlayerIds(db, context.userId, "COACH"));
    if (!playerId) return { ok: false as const, error: "NO_PLAYER" as const };
    const any = db as unknown as AnyDb;
    const row = {
      player_id: playerId,
      metric: data.metric,
      direction: data.direction,
      target: data.target,
      window_matches: data.windowMatches,
      deadline: data.deadline,
      reminder: data.reminder,
      reminder_weekday: data.reminderWeekday,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: updated, error } = await any
        .from("player_goals")
        .update(row)
        .eq("id", data.id)
        .eq("player_id", playerId)
        .select("id");
      if (error) throw new Error(`GOAL_WRITE_FAILED:${error.code ?? "unknown"}`);
      return updated?.length
        ? { ok: true as const }
        : { ok: false as const, error: "NOT_FOUND" as const };
    }
    const { count } = await any
      .from("player_goals")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId);
    if ((count ?? 0) >= MAX_GOALS) return { ok: false as const, error: "LIMIT" as const };
    const { error } = await any.from("player_goals").insert(row);
    if (error) throw new Error(`GOAL_WRITE_FAILED:${error.code ?? "unknown"}`);
    return { ok: true as const };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { id?: unknown } | null)?.id;
    return { id: typeof id === "string" && UUID.test(id) ? id : null };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) return { ok: false as const };
    const db = context.supabase as Db;
    const playerId = onePlayer(await ownPlayerIds(db, context.userId, "COACH"));
    if (!playerId) return { ok: false as const };
    const { error } = await (db as unknown as AnyDb)
      .from("player_goals")
      .delete()
      .eq("id", data.id)
      .eq("player_id", playerId);
    if (error) throw new Error(`GOAL_DELETE_FAILED:${error.code ?? "unknown"}`);
    return { ok: true as const };
  });
