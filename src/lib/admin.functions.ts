/**
 * Administrative server functions (Master Admin area).
 *
 * Every function is authenticated through the existing `requireSupabaseAuth`
 * middleware and re-verifies authorisation server-side against the database
 * (profiles + the authoritative `user_roles` table through the existing
 * `is_staff` / `is_admin_master` security-definer functions).
 *
 * Nothing here trusts a client-provided role. Authorisation is fail-closed:
 * any missing profile, unconfirmed status or failed role check aborts.
 */
import { createServerFn } from "@tanstack/react-start";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/** Single-administrator product model: one `admin_master`, everyone else is a player. */
export type AdminRole = "admin_master" | "player";
export type AccountStatus = "active" | "inactive";

export interface AdminSession {
  userId: string;
  role: "admin_master";
  isMaster: true;
}

export interface AdminUserRow {
  id: string;
  display_name: string | null;
  nickname: string | null;
  email: string | null;
  role: AdminRole;
  status: AccountStatus;
  country: string | null;
  locale: string;
  created_at: string;
  last_login_at: string | null;
  avatar_url: string | null;
}

export interface AdminProfileDetail {
  id: string;
  email: string | null;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  country: string | null;
  locale: string;
  role: AdminRole;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface AdminPlayerDetail {
  id: string;
  user_id: string;
  nickname: string | null;
  country: string | null;
  main_platform: string | null;
  current_level: string | null;
  competitive_goal: string | null;
  role: string | null;
  experience: string | null;
  team: string | null;
  faceit_username: string | null;
  faceit_player_id: string | null;
  gamersclub_username: string | null;
  gamersclub_player_id: string | null;
  steam_id: string | null;
}

/** JSON-serialisable value (audit metadata crosses the server boundary). */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface AdminIdentity {
  id: string;
  platform: string;
  username: string | null;
  external_id: string | null;
  is_verified: boolean;
  profile_url: string | null;
  created_at?: string;
}

export interface AdminUpload {
  id: string;
  file_name: string;
  type: string;
  source: string;
  file_size: number | null;
  mime_type: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AdminMatch {
  id: string;
  map: string | null;
  match_date: string | null;
  platform: string | null;
  result: string | null;
  score_player: number | null;
  score_opponent: number | null;
  rounds: number | null;
  external_match_id: string | null;
}

export interface AdminMatchMetrics {
  id: string;
  match_id: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  adr: number | null;
  kast: number | null;
  hs_percent: number | null;
  first_kills: number | null;
  first_deaths: number | null;
  opening_success: number | null;
  clutches: number | null;
  multi_kills: number | null;
  utility_damage: number | null;
  flash_assists: number | null;
  grenade_damage: number | null;
  ct_rating: number | null;
  t_rating: number | null;
  rating: number | null;
}

export interface AdminAnalysis {
  id: string;
  analysis_version: string;
  status: string;
  confidence: number | null;
  summary: string | null;
  created_at: string;
  source_upload_id: string | null;
}

export interface AdminFinding {
  id: string;
  analysis_id: string;
  skill_id: string | null;
  skill_slug?: string | null;
  type: string;
  priority: string | null;
  impact: string | null;
  confidence: number | null;
  title: string;
  description: string | null;
  evidence: JsonValue | null;
}

export interface AdminDna {
  id: string;
  aim: number | null;
  dueling: number | null;
  survivability: number | null;
  positioning: number | null;
  utility: number | null;
  decision_making: number | null;
  teamplay: number | null;
  economy: number | null;
  clutch: number | null;
  consistency: number | null;
  created_at: string;
}

export interface AdminScore {
  id: string;
  score: number;
  percentile: number | null;
  tier: string | null;
  created_at: string;
}

export interface AdminTrainingItem {
  id: string;
  training_plan_id: string;
  skill_id: string | null;
  skill_slug?: string | null;
  lesson_id: string | null;
  title: string;
  description: string | null;
  target_metric: string | null;
  target_value: string | null;
  sort_order: number;
  status: string;
}

export interface AdminTrainingPlan {
  id: string;
  horizon: number;
  status: string;
  title: string | null;
  objective: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  items: AdminTrainingItem[];
}

export interface AdminConversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  messageCount: number;
}

export interface AuditLogRow {
  id: string;
  action: string;
  admin_user_id: string;
  target_user_id: string | null;
  metadata: Record<string, JsonValue> | null;
  created_at: string;
}

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

/** Generic, non-revealing error codes surfaced to the client. */
const FORBIDDEN = "ADMIN_FORBIDDEN";
const FAILED = "ADMIN_OPERATION_FAILED";
/** The authorisation state could not be determined (backend/infra problem). */
const UNAVAILABLE = "ADMIN_UNAVAILABLE";

async function resolveAdmin(context: Ctx): Promise<AdminSession> {
  const { supabase, userId } = context;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();

  // The profile could not be read at all: this is an infrastructure failure,
  // not a denial. It is reported separately so the UI can show an error state
  // instead of silently pretending the user is not an administrator.
  if (error) throw new Error(UNAVAILABLE);

  // Fail-closed: no profile / not active => no access.
  if (!profile || profile.status !== "active") throw new Error(FORBIDDEN);

  // Authoritative role check against `user_roles` (security-definer function).
  const { data: master, error: masterError } = await supabase.rpc("is_admin_master", {
    _user_id: userId,
  });

  if (masterError) throw new Error(UNAVAILABLE);
  if (master !== true) throw new Error(FORBIDDEN);

  return { userId, role: "admin_master", isMaster: true };
}

/**
 * Appends an audit entry. Auditing is mandatory: when the entry cannot be
 * written the caller MUST treat the whole operation as failed, so this throws
 * instead of silently swallowing the error.
 */
async function writeAuditLog(
  context: Ctx,
  action: string,
  targetUserId: string | null,
  metadata: Record<string, JsonValue>,
) {
  const { error } = await context.supabase.from("admin_audit_logs").insert({
    admin_user_id: context.userId,
    action,
    target_user_id: targetUserId,
    metadata,
  });
  if (error) throw new Error(FAILED);
}

/** Returns the caller's administrative session, or throws when unauthorised. */
export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => resolveAdmin(context as Ctx));

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveAdmin(context as Ctx);
    const supabase = (context as Ctx).supabase;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Filters must be chained AFTER select() on the PostgREST builder.
    const count = () => supabase.from("profiles").select("id", { count: "exact", head: true });

    const [total, active, inactive, admins, recent, logins] = await Promise.all([
      count(),
      count().eq("status", "active").eq("role", "player"),
      count().eq("status", "inactive"),
      count().eq("role", "admin_master"),
      count().gte("created_at", sevenDaysAgo),
      supabase
        .from("profiles")
        .select("id, display_name, nickname, email, last_login_at")
        .not("last_login_at", "is", null)
        .order("last_login_at", { ascending: false })
        .limit(5),
    ]);

    return {
      totalUsers: total.count ?? 0,
      activePlayers: active.count ?? 0,
      inactiveUsers: inactive.count ?? 0,
      admins: admins.count ?? 0,
      newUsers: recent.count ?? 0,
      lastLogins: (logins.data ?? []) as Array<{
        id: string;
        display_name: string | null;
        nickname: string | null;
        email: string | null;
        last_login_at: string | null;
      }>,
    };
  });

export const listAdminUsers = createServerFn({ method: "GET" })
  .inputValidator(
    (input: {
      search?: string;
      role?: AdminRole | "all";
      status?: AccountStatus | "all";
      page?: number;
      pageSize?: number;
    }) => input,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await resolveAdmin(context as Ctx);
    const supabase = (context as Ctx).supabase;

    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(50, Math.max(5, data.pageSize ?? 20));
    const from = (page - 1) * pageSize;

    let query = supabase
      .from("profiles")
      .select(
        "id, display_name, nickname, email, role, status, country, locale, created_at, last_login_at, avatar_url",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    const search = (data.search ?? "").trim();
    if (search) {
      const escaped = search.replace(/[,%]/g, " ");
      query = query.or(
        `display_name.ilike.%${escaped}%,nickname.ilike.%${escaped}%,email.ilike.%${escaped}%`,
      );
    }
    if (data.role && data.role !== "all") query = query.eq("role", data.role);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(FAILED);

    return {
      rows: (rows ?? []) as AdminUserRow[],
      total: count ?? 0,
      page,
      pageSize,
    };
  });

/**
 * Full administrative view of one player's journey.
 *
 * All sections are fetched with a bounded number of queries (no N+1): the
 * player row is resolved first, then every dependent collection is fetched in
 * parallel and joined in memory. Everything is read through the admin's own
 * RLS context (`is_staff` policies), never with the service role.
 */
export const getAdminUserDetail = createServerFn({ method: "GET" })
  .inputValidator((input: { userId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await resolveAdmin(context as Ctx);
    const supabase = (context as Ctx).supabase;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.userId)
      .maybeSingle();
    if (error || !profile) throw new Error(FAILED);

    const [{ data: player }, { data: auditRows }, { data: uploadRows }] = await Promise.all([
      supabase.from("player_profiles").select("*").eq("user_id", data.userId).maybeSingle(),
      supabase
        .from("admin_audit_logs")
        .select("id, action, admin_user_id, target_user_id, metadata, created_at")
        .eq("target_user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("uploads")
        .select(
          "id, file_name, type, source, file_size, mime_type, status, error_message, created_at, processed_at",
        )
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const empty = {
      identities: [] as AdminIdentity[],
      matches: [] as AdminMatch[],
      metrics: [] as AdminMatchMetrics[],
      analyses: [] as AdminAnalysis[],
      findings: [] as AdminFinding[],
      dna: null as AdminDna | null,
      score: null as AdminScore | null,
      plans: [] as AdminTrainingPlan[],
      conversations: [] as AdminConversation[],
    };

    if (!player) {
      return {
        profile: profile as AdminProfileDetail,
        player: null,
        uploads: (uploadRows ?? []) as AdminUpload[],
        audit: (auditRows ?? []) as AuditLogRow[],
        ...empty,
      };
    }

    const playerId = player.id;

    const [
      identitiesRes,
      matchesRes,
      metricsRes,
      analysesRes,
      dnaRes,
      scoreRes,
      plansRes,
      conversationsRes,
    ] = await Promise.all([
      supabase
        .from("player_identities")
        .select("id, platform, username, external_id, is_verified, profile_url, created_at")
        .eq("player_id", playerId),
      supabase
        .from("matches")
        .select(
          "id, map, match_date, platform, result, score_player, score_opponent, rounds, external_match_id",
        )
        .eq("player_id", playerId)
        .order("match_date", { ascending: false })
        .limit(50),
      supabase.from("match_metrics").select("*").eq("player_id", playerId).limit(50),
      supabase
        .from("analyses")
        .select("id, analysis_version, status, confidence, summary, created_at, source_upload_id")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("player_dna_snapshots")
        .select("*")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("player_score_snapshots")
        .select("id, score, percentile, tier, created_at")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("training_plans")
        .select("id, horizon, status, title, objective, start_date, end_date, created_at")
        .eq("player_id", playerId)
        .order("horizon", { ascending: true }),
      supabase
        .from("coach_conversations")
        .select("id, title, created_at, updated_at")
        .eq("player_id", playerId)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    const analyses = (analysesRes.data ?? []) as AdminAnalysis[];
    const plans = (plansRes.data ?? []) as Array<Omit<AdminTrainingPlan, "items">>;
    const conversations = (conversationsRes.data ?? []) as Array<
      Omit<AdminConversation, "messageCount">
    >;

    // Two batched follow-up queries (IN filters) keep this free of N+1 loops.
    const [findingsRes, itemsRes, messagesRes, skillsRes] = await Promise.all([
      analyses.length
        ? supabase
            .from("analysis_findings")
            .select(
              "id, analysis_id, skill_id, type, priority, impact, confidence, title, description, evidence",
            )
            .in(
              "analysis_id",
              analyses.map((a) => a.id),
            )
        : Promise.resolve({ data: [] }),
      plans.length
        ? supabase
            .from("training_plan_items")
            .select(
              "id, training_plan_id, skill_id, lesson_id, title, description, target_metric, target_value, sort_order, status",
            )
            .in(
              "training_plan_id",
              plans.map((p) => p.id),
            )
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] }),
      conversations.length
        ? supabase
            .from("coach_messages")
            .select("id, conversation_id")
            .in(
              "conversation_id",
              conversations.map((c) => c.id),
            )
        : Promise.resolve({ data: [] }),
      supabase.from("skills").select("id, slug"),
    ]);

    const skillSlug = new Map<string, string>(
      ((skillsRes.data ?? []) as Array<{ id: string; slug: string }>).map((s) => [s.id, s.slug]),
    );

    const findings = ((findingsRes.data ?? []) as AdminFinding[]).map((f) => ({
      ...f,
      skill_slug: f.skill_id ? (skillSlug.get(f.skill_id) ?? null) : null,
    }));

    const items = (itemsRes.data ?? []) as AdminTrainingItem[];
    const messageCounts = new Map<string, number>();
    for (const message of (messagesRes.data ?? []) as Array<{ conversation_id: string }>) {
      messageCounts.set(
        message.conversation_id,
        (messageCounts.get(message.conversation_id) ?? 0) + 1,
      );
    }

    return {
      profile: profile as AdminProfileDetail,
      player: player as AdminPlayerDetail,
      identities: (identitiesRes.data ?? []) as AdminIdentity[],
      uploads: (uploadRows ?? []) as AdminUpload[],
      matches: (matchesRes.data ?? []) as AdminMatch[],
      metrics: (metricsRes.data ?? []) as AdminMatchMetrics[],
      analyses,
      findings,
      dna: (dnaRes.data ?? null) as AdminDna | null,
      score: (scoreRes.data ?? null) as AdminScore | null,
      plans: plans.map((plan) => ({
        ...plan,
        items: items
          .filter((i) => i.training_plan_id === plan.id)
          .map((i) => ({
            ...i,
            skill_slug: i.skill_id ? (skillSlug.get(i.skill_id) ?? null) : null,
          })),
      })),
      conversations: conversations.map((c) => ({
        ...c,
        messageCount: messageCounts.get(c.id) ?? 0,
      })),
      audit: (auditRows ?? []) as AuditLogRow[],
    };
  });

/**
 * Starts a secure password reset for a player through Supabase Auth.
 * No password is ever stored or generated by the product: the user completes
 * the flow through the normal `/reset-password` route.
 */
export const resetAdminUserPassword = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; redirectTo: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await resolveAdmin(context as Ctx);
    const supabase = (context as Ctx).supabase;

    const { data: target } = await supabase
      .from("profiles")
      .select("id, email, role")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target?.email) throw new Error(FAILED);

    // Explicit allowlist of application origins; the client-supplied path is
    // discarded and always normalised to `/reset-password`.
    let redirectTo: string;
    try {
      const { safeResetPasswordUrl } = await import("@/lib/safe-redirect");
      redirectTo = safeResetPasswordUrl(data.redirectTo);
    } catch {
      throw new Error(FAILED);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(target.email, { redirectTo });
    if (error) throw new Error(FAILED);

    await writeAuditLog(context as Ctx, "PASSWORD_RESET_REQUESTED", data.userId, {
      email: target.email,
    });

    return { ok: true };
  });


export const updateAdminUser = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      userId: string;
      profile?: {
        display_name?: string | null;
        nickname?: string | null;
        country?: string | null;
        locale?: string;
      };
      player?: {
        nickname?: string | null;
        country?: string | null;
        main_platform?: string | null;
        current_level?: string | null;
        competitive_goal?: string | null;
        role?: string | null;
        experience?: string | null;
        team?: string | null;
      };
    }) => input,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await resolveAdmin(context as Ctx);
    const supabase = (context as Ctx).supabase;

    if (data.profile && Object.keys(data.profile).length > 0) {
      const { error } = await supabase.from("profiles").update(data.profile).eq("id", data.userId);
      if (error) throw new Error(FAILED);
    }

    if (data.player && Object.keys(data.player).length > 0) {
      const { data: existing } = await supabase
        .from("player_profiles")
        .select("id")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("player_profiles")
          .update(data.player)
          .eq("id", existing.id);
        if (error) throw new Error(FAILED);
      } else {
        const { error } = await supabase
          .from("player_profiles")
          .insert({ user_id: data.userId, ...data.player });
        if (error) throw new Error(FAILED);
      }
    }

    await writeAuditLog(context as Ctx, "PROFILE_UPDATED", data.userId, {
      profile_fields: Object.keys(data.profile ?? {}),
      player_fields: Object.keys(data.player ?? {}),
    });

    return { ok: true };
  });

export const setAdminUserStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; status: AccountStatus }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const session = await resolveAdmin(context as Ctx);
    if (data.userId === session.userId) throw new Error(FORBIDDEN);
    const supabase = (context as Ctx).supabase;

    const { data: target } = await supabase
      .from("profiles")
      .select("id, role, status")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target) throw new Error(FAILED);
    // Administrator accounts are never deactivated through user management.
    if (target.role !== "player") throw new Error(FORBIDDEN);

    const previousStatus = target.status as AccountStatus;

    const { error } = await supabase
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw new Error(FAILED);

    try {
      await writeAuditLog(
        context as Ctx,
        data.status === "active" ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        data.userId,
        { status: data.status, previous_status: previousStatus },
      );
    } catch (auditError) {
      // Auditing is mandatory: revert the change so no unaudited status
      // transition can persist.
      await supabase.from("profiles").update({ status: previousStatus }).eq("id", data.userId);
      throw auditError;
    }

    return { ok: true };
  });

export const createPlayerUser = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      email: string;
      password: string;
      display_name?: string;
      nickname?: string;
      country?: string;
      locale?: string;
    }) => input,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await resolveAdmin(context as Ctx);
    if (!data.email.includes("@") || data.password.length < 8) throw new Error(FAILED);

    // The service-role key never leaves the server runtime.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        display_name: data.display_name ?? null,
        nickname: data.nickname ?? null,
        country: data.country ?? null,
        locale: data.locale ?? "en",
      },
    });
    if (error || !created?.user) throw new Error(FAILED);

    const newUserId = created.user.id;

    // Auditing is mandatory. The Auth Admin API is not transactional, so when
    // the audit entry cannot be written the freshly created account is removed
    // again: no unaudited account may survive this operation.
    try {
      // Only player accounts can be created: this product has a single administrator.
      await writeAuditLog(context as Ctx, "USER_CREATED", newUserId, {
        email: data.email,
        role: "player",
      });
    } catch (auditError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw auditError;
    }

    return { ok: true, userId: newUserId };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .inputValidator((input: { page?: number; pageSize?: number }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await resolveAdmin(context as Ctx);
    const supabase = (context as Ctx).supabase;

    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(50, Math.max(5, data.pageSize ?? 20));
    const from = (page - 1) * pageSize;

    const {
      data: logs,
      count,
      error,
    } = await supabase
      .from("admin_audit_logs")
      .select("id, action, admin_user_id, target_user_id, metadata, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(FAILED);

    const ids = Array.from(
      new Set(
        ((logs ?? []) as AuditLogRow[])
          .flatMap((l) => [l.admin_user_id, l.target_user_id])
          .filter(Boolean),
      ),
    ) as string[];

    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: people } = await supabase
        .from("profiles")
        .select("id, display_name, nickname, email")
        .in("id", ids);
      for (const p of people ?? []) {
        names[p.id] = p.display_name || p.nickname || p.email || p.id;
      }
    }

    return { rows: (logs ?? []) as AuditLogRow[], names, total: count ?? 0, page, pageSize };
  });
