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

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
}

type Ctx = { supabase: any; userId: string };

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
  metadata: Record<string, unknown>,
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
        "id, display_name, nickname, email, role, status, country, locale, created_at, last_login_at",
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

    const { data: player } = await supabase
      .from("player_profiles")
      .select("*")
      .eq("user_id", data.userId)
      .maybeSingle();

    const identities = player
      ? ((
          await supabase
            .from("player_identities")
            .select("id, platform, username, external_id, is_verified, profile_url")
            .eq("player_id", player.id)
        ).data ?? [])
      : [];

    return { profile, player: player ?? null, identities };
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


export const createAdminUser = createServerFn({ method: "POST" })
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

    // Only player accounts can be created: this product has a single administrator.
    await writeAuditLog(context as Ctx, "USER_CREATED", newUserId, {
      email: data.email,
      role: "player",
    });

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
        (logs ?? []).flatMap((l: any) => [l.admin_user_id, l.target_user_id]).filter(Boolean),
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

    return { rows: (logs ?? []) as any[], names, total: count ?? 0, page, pageSize };
  });
