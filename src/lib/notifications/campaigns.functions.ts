/**
 * Fase 4.1 — Admin Notification Center server functions.
 *
 * Every call runs with the CALLER's Supabase session (never the service role): the database
 * RPCs check the caller's role (admin / admin_master), validate, apply the state machine and
 * write admin_audit_logs in the same transaction; RLS limits reads to staff. Inputs are
 * validated here too, so a malformed request never reaches the database. Errors are returned
 * as stable codes, never raw messages.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  CAMPAIGN_ACTIONS,
  CAMPAIGN_KINDS,
  campaignErrorFrom,
  campaignPatchFrom,
  isLocale,
  isUuid,
  segmentValid,
  translationFrom,
  type CampaignAction,
  type CampaignError,
  type CampaignKind,
  type CampaignLocale,
  type CampaignPatch,
  type CampaignStatus,
  type SegmentSpec,
} from "./campaigns";

// The 4.1 tables and RPCs are added by a manual migration (not in the generated types).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;
type Ctx = { supabase: unknown; userId: string };
const dbOf = (context: Ctx) => context.supabase as AnyDb;

export type Result<T> = { ok: true; value: T } | { ok: false; error: CampaignError };
const fail = (
  error: { code?: string; message?: string } | null,
): { ok: false; error: CampaignError } => ({
  ok: false,
  error: campaignErrorFrom(error),
});

export interface CampaignTranslationView {
  locale: CampaignLocale;
  title: string;
  body: string;
  approved: boolean;
  approvedAt: string | null;
  updatedAt: string;
}

export interface CampaignView {
  id: string;
  name: string;
  kind: CampaignKind;
  status: CampaignStatus;
  sourceLocale: CampaignLocale;
  link: string;
  segment: SegmentSpec;
  segmentId: string | null;
  scheduledAt: string | null;
  confirmedAudience: number | null;
  targeted: number;
  accepted: number;
  suppressed: number;
  rejected: number;
  duplicates: number;
  failures: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  translations: CampaignTranslationView[];
}

export interface SegmentView {
  id: string;
  name: string;
  spec: SegmentSpec;
  estimatedCount: number | null;
  estimatedAt: string | null;
}

export interface CampaignStats {
  created: number;
  accepted: number;
  suppressed: number;
  rejected: number;
  delivered_in_app: number;
  read: number;
  deleted_by_player: number;
  by_reason: Record<string, number>;
}

export interface AdminDashboard {
  events: Array<{ category: string; status: string; reason: string | null; events: number }>;
  delivered_in_app: number;
  read: number;
  active_accounts: number;
  marketing_consents: number;
  campaigns: Record<string, number>;
  last_retention_run: { status: string; started_at: string } | null;
}

const CAMPAIGN_COLUMNS =
  "id, name, kind, status, source_locale, link, segment, segment_id, scheduled_at, confirmed_audience, targeted, accepted, suppressed, rejected, duplicates, failures, last_error, started_at, finished_at, version, created_at, updated_at";

function campaignView(
  row: Record<string, unknown>,
  texts: Array<Record<string, unknown>>,
): CampaignView {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    kind: row["kind"] as CampaignKind,
    status: row["status"] as CampaignStatus,
    sourceLocale: row["source_locale"] as CampaignLocale,
    link: row["link"] as string,
    segment: row["segment"] as SegmentSpec,
    segmentId: (row["segment_id"] as string | null) ?? null,
    scheduledAt: (row["scheduled_at"] as string | null) ?? null,
    confirmedAudience: (row["confirmed_audience"] as number | null) ?? null,
    targeted: Number(row["targeted"] ?? 0),
    accepted: Number(row["accepted"] ?? 0),
    suppressed: Number(row["suppressed"] ?? 0),
    rejected: Number(row["rejected"] ?? 0),
    duplicates: Number(row["duplicates"] ?? 0),
    failures: Number(row["failures"] ?? 0),
    lastError: (row["last_error"] as string | null) ?? null,
    startedAt: (row["started_at"] as string | null) ?? null,
    finishedAt: (row["finished_at"] as string | null) ?? null,
    version: Number(row["version"]),
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
    translations: texts
      .filter((t) => t["campaign_id"] === row["id"])
      .map((t) => ({
        locale: t["locale"] as CampaignLocale,
        title: t["title"] as string,
        body: t["body"] as string,
        approved: t["approved_at"] !== null,
        approvedAt: (t["approved_at"] as string | null) ?? null,
        updatedAt: t["updated_at"] as string,
      })),
  };
}

// ------------------------------------------------------------------ pure input validators
export function rangeFrom(input: unknown): { from: string; to: string } | null {
  const v = (input ?? {}) as Record<string, unknown>;
  const from = typeof v["from"] === "string" ? Date.parse(v["from"]) : NaN;
  const to = typeof v["to"] === "string" ? Date.parse(v["to"]) : NaN;
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from || to - from > 366 * 86_400_000)
    return null;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

export function actionFrom(input: unknown): {
  id: string;
  action: CampaignAction;
  version: number;
  args: { confirm_audience?: number; scheduled_at?: string };
} | null {
  const v = (input ?? {}) as Record<string, unknown>;
  if (!isUuid(v["id"]) || !(CAMPAIGN_ACTIONS as readonly unknown[]).includes(v["action"]))
    return null;
  if (typeof v["version"] !== "number" || !Number.isInteger(v["version"]) || v["version"] < 1)
    return null;
  const a = (v["args"] ?? {}) as Record<string, unknown>;
  const args: { confirm_audience?: number; scheduled_at?: string } = {};
  if (a["confirm_audience"] !== undefined) {
    if (typeof a["confirm_audience"] !== "number" || !Number.isInteger(a["confirm_audience"]))
      return null;
    args.confirm_audience = a["confirm_audience"];
  }
  if (a["scheduled_at"] !== undefined) {
    if (typeof a["scheduled_at"] !== "string" || Number.isNaN(Date.parse(a["scheduled_at"])))
      return null;
    args.scheduled_at = new Date(a["scheduled_at"]).toISOString();
  }
  return { id: v["id"], action: v["action"] as CampaignAction, version: v["version"], args };
}

// ------------------------------------------------------------------ reads
export const getNotificationAdminContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ level: number; available: boolean }> => {
    const { data, error } = await dbOf(context).rpc("notification_admin_level");
    if (error) return { level: 0, available: campaignErrorFrom(error) !== "UNAVAILABLE" };
    return { level: Number(data ?? 0), available: true };
  });

export const getNotificationAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rangeFrom(input))
  .handler(async ({ context, data }): Promise<Result<AdminDashboard>> => {
    if (!data) return { ok: false, error: "NOTIFICATION_RANGE_INVALID" };
    const { data: out, error } = await dbOf(context).rpc("notification_admin_dashboard", {
      p_from: data.from,
      p_to: data.to,
    });
    return error ? fail(error) : { ok: true, value: out as AdminDashboard };
  });

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result<CampaignView[]>> => {
    const db = dbOf(context);
    const { data: rows, error } = await db
      .from("notification_campaigns")
      .select(CAMPAIGN_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return fail(error);
    const ids = (rows ?? []).map((r) => (r as { id: string }).id);
    let texts: Array<Record<string, unknown>> = [];
    if (ids.length) {
      const t = await db
        .from("notification_campaign_translations")
        .select("campaign_id, locale, title, body, approved_at, updated_at")
        .in("campaign_id", ids);
      if (t.error) return fail(t.error);
      texts = (t.data ?? []) as Array<Record<string, unknown>>;
    }
    return {
      ok: true,
      value: (rows ?? []).map((r) => campaignView(r as Record<string, unknown>, texts)),
    };
  });

export const getCampaignStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as Record<string, unknown> | null)?.["id"];
    return { id: isUuid(id) ? id : null };
  })
  .handler(async ({ context, data }): Promise<Result<CampaignStats>> => {
    if (!data.id) return { ok: false, error: "NOTIFICATION_CAMPAIGN_INVALID" };
    const { data: out, error } = await dbOf(context).rpc("notification_campaign_stats", {
      p_id: data.id,
    });
    return error ? fail(error) : { ok: true, value: out as CampaignStats };
  });

export const listSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result<SegmentView[]>> => {
    const { data, error } = await dbOf(context)
      .from("notification_segments")
      .select("id, name, spec, estimated_count, estimated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) return fail(error);
    return {
      ok: true,
      value: (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: row["id"] as string,
          name: row["name"] as string,
          spec: row["spec"] as SegmentSpec,
          estimatedCount: (row["estimated_count"] as number | null) ?? null,
          estimatedAt: (row["estimated_at"] as string | null) ?? null,
        };
      }),
    };
  });

export const estimateAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as Record<string, unknown>;
    const kind = (CAMPAIGN_KINDS as readonly unknown[]).includes(v["kind"])
      ? (v["kind"] as CampaignKind)
      : null;
    return segmentValid(v["spec"]) && kind ? { spec: v["spec"], kind } : null;
  })
  .handler(async ({ context, data }): Promise<Result<number>> => {
    if (!data) return { ok: false, error: "NOTIFICATION_SEGMENT_INVALID" };
    const { data: out, error } = await dbOf(context).rpc("notification_campaign_estimate", {
      p_spec: data.spec,
      p_kind: data.kind,
    });
    return error ? fail(error) : { ok: true, value: Number(out) };
  });

// ------------------------------------------------------------------ writes (all audited in SQL)
export const saveSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as Record<string, unknown>;
    const name = typeof v["name"] === "string" ? v["name"].trim() : "";
    if (name.length < 3 || name.length > 80 || !segmentValid(v["spec"])) return null;
    if (v["id"] !== undefined && v["id"] !== null && !isUuid(v["id"])) return null;
    return { id: (v["id"] as string | null | undefined) ?? null, name, spec: v["spec"] };
  })
  .handler(async ({ context, data }): Promise<Result<string>> => {
    if (!data) return { ok: false, error: "NOTIFICATION_SEGMENT_INVALID" };
    const { data: out, error } = await dbOf(context).rpc("notification_segment_save", {
      p_id: data.id,
      p_name: data.name,
      p_spec: data.spec,
    });
    return error ? fail(error) : { ok: true, value: out as string };
  });

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as Record<string, unknown>;
    const patch = campaignPatchFrom(v["patch"]);
    if (!patch) return null;
    if (v["id"] === null || v["id"] === undefined) {
      // A new campaign needs at least a name and a kind.
      if (!patch.name || !patch.kind) return null;
      return { id: null, version: 0, patch };
    }
    if (!isUuid(v["id"]) || typeof v["version"] !== "number") return null;
    return { id: v["id"], version: v["version"], patch };
  })
  .handler(
    async ({
      context,
      data,
    }): Promise<Result<{ id: string; version: number; status: CampaignStatus }>> => {
      if (!data) return { ok: false, error: "NOTIFICATION_CAMPAIGN_INVALID" };
      const { data: out, error } = await dbOf(context).rpc("notification_campaign_save", {
        p_id: data.id,
        p_expected_version: data.version,
        p_patch: data.patch satisfies CampaignPatch,
      });
      return error
        ? fail(error)
        : { ok: true, value: out as { id: string; version: number; status: CampaignStatus } };
    },
  );

export const saveCampaignTranslation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => translationFrom(input))
  .handler(async ({ context, data }): Promise<Result<true>> => {
    if (!data) return { ok: false, error: "NOTIFICATION_CAMPAIGN_INVALID" };
    const { error } = await dbOf(context).rpc("notification_campaign_translation_save", {
      p_campaign: data.campaignId,
      p_locale: data.locale,
      p_title: data.title,
      p_body: data.body,
    });
    return error ? fail(error) : { ok: true, value: true };
  });

export const approveCampaignTranslation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as Record<string, unknown>;
    return isUuid(v["campaignId"]) && isLocale(v["locale"])
      ? { campaignId: v["campaignId"], locale: v["locale"] }
      : null;
  })
  .handler(async ({ context, data }): Promise<Result<true>> => {
    if (!data) return { ok: false, error: "NOTIFICATION_CAMPAIGN_INVALID" };
    const { error } = await dbOf(context).rpc("notification_campaign_translation_approve", {
      p_campaign: data.campaignId,
      p_locale: data.locale,
    });
    return error ? fail(error) : { ok: true, value: true };
  });

export const runCampaignAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => actionFrom(input))
  .handler(
    async ({
      context,
      data,
    }): Promise<
      Result<{ id: string; version: number; status: CampaignStatus; audience?: number }>
    > => {
      if (!data) return { ok: false, error: "NOTIFICATION_CAMPAIGN_INVALID" };
      const { data: out, error } = await dbOf(context).rpc("notification_campaign_action", {
        p_id: data.id,
        p_action: data.action,
        p_expected_version: data.version,
        p_args: data.args,
      });
      return error
        ? fail(error)
        : {
            ok: true,
            value: out as {
              id: string;
              version: number;
              status: CampaignStatus;
              audience?: number;
            },
          };
    },
  );

/** Test send: to the caller only (the database also accepts another staff member). */
export const testSendCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as Record<string, unknown> | null)?.["id"];
    return { id: isUuid(id) ? id : null };
  })
  .handler(
    async ({
      context,
      data,
    }): Promise<Result<{ accepted: number; suppressed: number; rejected: number }>> => {
      if (!data.id) return { ok: false, error: "NOTIFICATION_CAMPAIGN_INVALID" };
      const { data: out, error } = await dbOf(context).rpc("notification_campaign_test_send", {
        p_id: data.id,
        p_recipient: null,
      });
      return error
        ? fail(error)
        : { ok: true, value: out as { accepted: number; suppressed: number; rejected: number } };
    },
  );
