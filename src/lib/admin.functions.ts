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

export type AdminRole = "admin_master" | "admin" | "player";
export type AccountStatus = "active" | "inactive";

export interface AdminSession {
  userId: string;
  role: Extract<AdminRole, "admin_master" | "admin">;
  isMaster: boolean;
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

async function resolveAdmin(context: Ctx): Promise<AdminSession> {
  const { supabase, userId } = context;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();

  // Fail-closed: no profile / unreadable profile / not active => no access.
  if (error || !profile || profile.status !== "active") throw new Error(FORBIDDEN);

  const [{ data: staff, error: staffError }, { data: master, error: masterError }] =
    await Promise.all([
      supabase.rpc("is_staff", { _user_id: userId }),
      supabase.rpc("is_admin_master", { _user_id: userId }),
    ]);

  if (staffError || masterError || staff !== true) throw new Error(FORBIDDEN);

  return { userId, role: master === true ? "admin_master" : "admin", isMaster: master === true };
}

async function writeAuditLog(
  context: Ctx,
  action: string,
  targetUserId: string | null,
  metadata: Record<string, unknown>,
) {
  await context.supabase.from("admin_audit_logs").insert({
    admin_user_id: context.userId,
    action,
    target_user_id: targetUserId,
    metadata,
  });
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

    const [total, active, inactive, admins, masters, recent, logins] = await Promise.all([
      count(),
      count().eq("status", "active").eq("role", "player"),
      count().eq("status", "inactive"),
      count().in("role", ["admin", "admin_master"]),
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
      masters: masters.count ?? 0,
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
      .select("id, role")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target) throw new Error(FAILED);
    // Only a master admin may deactivate another administrator.
    if (target.role !== "player" && !session.isMaster) throw new Error(FORBIDDEN);

    const { error } = await supabase
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw new Error(FAILED);

    await writeAuditLog(
      context as Ctx,
      data.status === "active" ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      data.userId,
      { status: data.status },
    );

    return { ok: true };
  });

export const setAdminUserRole = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; role: AdminRole }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const session = await resolveAdmin(context as Ctx);
    // Role management is reserved to master admins (also enforced in the
    // database by the `guard_profile_role` trigger).
    if (!session.isMaster) throw new Error(FORBIDDEN);
    if (data.userId === session.userId) throw new Error(FORBIDDEN);
    if (!["admin_master", "admin", "player"].includes(data.role)) throw new Error(FAILED);

    const supabase = (context as Ctx).supabase;
    const { data: before } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.userId)
      .maybeSingle();
    if (!before) throw new Error(FAILED);

    const { error } = await supabase
      .from("profiles")
      .update({ role: data.role })
      .eq("id", data.userId);
    if (error) throw new Error(FAILED);

    await writeAuditLog(context as Ctx, "ROLE_CHANGED", data.userId, {
      from: before.role,
      to: data.role,
    });

    return { ok: true };
  });

export const createAdminUser = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      email: string;
      password: string;
      role: AdminRole;
      display_name?: string;
      nickname?: string;
      country?: string;
      locale?: string;
    }) => input,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const session = await resolveAdmin(context as Ctx);
    if (!session.isMaster) throw new Error(FORBIDDEN);
    if (!data.email.includes("@") || data.password.length < 8) throw new Error(FAILED);
    if (!["admin_master", "admin", "player"].includes(data.role)) throw new Error(FAILED);

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
    if (data.role !== "player") {
      const { error: roleError } = await supabaseAdmin
        .from("profiles")
        .update({ role: data.role })
        .eq("id", newUserId);
      if (roleError) throw new Error(FAILED);
    }

    await writeAuditLog(context as Ctx, "USER_CREATED", newUserId, {
      email: data.email,
      role: data.role,
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
