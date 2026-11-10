/**
 * Fase 4.1 — Admin Notification Center: pure types, validators and helpers shared by the server
 * functions and the admin UI. The database is the authority (every RPC re-validates, checks
 * the caller's role and audits); these mirror its rules so the UI can explain them early.
 */

export const CAMPAIGN_LOCALES = ["pt-BR", "pt-PT", "en", "es", "fr"] as const;
export type CampaignLocale = (typeof CAMPAIGN_LOCALES)[number];

export const CAMPAIGN_KINDS = ["operational", "product", "educational", "commercial"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "SENDING",
  "PAUSED",
  "SENT",
  "CANCELLED",
  "FAILED",
  "ARCHIVED",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_ACTIONS = [
  "schedule",
  "unschedule",
  "pause",
  "resume",
  "cancel",
  "retry",
  "archive",
  "duplicate",
] as const;
export type CampaignAction = (typeof CAMPAIGN_ACTIONS)[number];

/** Must equal notification_campaign_action in the 4.1 migration. */
export const ACTION_RULES: Record<CampaignAction, { level: 1 | 2; from: CampaignStatus[] }> = {
  schedule: { level: 2, from: ["DRAFT"] },
  unschedule: { level: 2, from: ["SCHEDULED"] },
  pause: { level: 2, from: ["SCHEDULED", "SENDING"] },
  resume: { level: 2, from: ["PAUSED"] },
  cancel: { level: 2, from: ["DRAFT", "SCHEDULED", "SENDING", "PAUSED", "FAILED"] },
  retry: { level: 2, from: ["FAILED"] },
  archive: { level: 1, from: ["DRAFT", "SENT", "CANCELLED", "FAILED"] },
  duplicate: { level: 1, from: [...CAMPAIGN_STATUSES] },
};

/** Actions offered for a campaign in this state to a caller of this level (0/1/2). */
export function availableActions(status: CampaignStatus, level: number): CampaignAction[] {
  return CAMPAIGN_ACTIONS.filter(
    (a) => level >= ACTION_RULES[a].level && ACTION_RULES[a].from.includes(status),
  );
}

/** Notification category each campaign kind is delivered under. */
export const KIND_CATEGORY: Record<CampaignKind, "operational" | "announcements" | "marketing"> = {
  operational: "operational",
  product: "announcements",
  educational: "announcements",
  commercial: "marketing",
};

// ------------------------------------------------------------------ segments
export const SEGMENT_FIELDS = {
  locale: { ops: ["in"], value: "locales" },
  country: { ops: ["in"], value: "countries" },
  account_age_days: { ops: ["gte", "lte"], value: "days" },
  last_login_days: { ops: ["gte", "lte"], value: "days" },
  processed_demos: { ops: ["gte", "lte"], value: "count" },
  steam_linked: { ops: ["eq"], value: "boolean" },
  has_goal: { ops: ["eq"], value: "boolean" },
  marketing_consent: { ops: ["eq"], value: "boolean" },
} as const;
export type SegmentField = keyof typeof SEGMENT_FIELDS;

export interface SegmentRule {
  field: SegmentField;
  op: "in" | "gte" | "lte" | "eq";
  value: string[] | number | boolean;
}
export interface SegmentSpec {
  op: "AND" | "OR";
  rules: Array<SegmentRule | SegmentSpec>;
}

export const EMPTY_SEGMENT: SegmentSpec = { op: "AND", rules: [] };

/** Mirrors notification_segment_valid: whitelisted fields/operators/values, one nesting level. */
export function segmentValid(spec: unknown, depth = 0): spec is SegmentSpec {
  if (!spec || typeof spec !== "object" || Array.isArray(spec) || depth > 1) return false;
  const s = spec as Record<string, unknown>;
  if (s["op"] !== "AND" && s["op"] !== "OR") return false;
  const rules = s["rules"];
  if (!Array.isArray(rules) || rules.length > 20) return false;
  return rules.every((r) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) return false;
    const rule = r as Record<string, unknown>;
    if ("rules" in rule) return segmentValid(rule, depth + 1);
    const def = SEGMENT_FIELDS[rule["field"] as SegmentField];
    if (!def || !(def.ops as readonly string[]).includes(rule["op"] as string)) return false;
    const v = rule["value"];
    switch (def.value) {
      case "locales":
        return (
          Array.isArray(v) &&
          v.length >= 1 &&
          v.length <= 30 &&
          v.every((x) => (CAMPAIGN_LOCALES as readonly unknown[]).includes(x))
        );
      case "countries":
        return (
          Array.isArray(v) &&
          v.length >= 1 &&
          v.length <= 30 &&
          v.every((x) => typeof x === "string" && /^[A-Z]{2}$/.test(x))
        );
      case "days":
        return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3650;
      case "count":
        return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10000;
      default:
        return typeof v === "boolean";
    }
  });
}

// ------------------------------------------------------------------ texts and inputs
export const TITLE_MAX = 80;
export const BODY_MAX = 280;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LINK = /^\/[a-z0-9/_-]{1,60}$/;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const isLocale = (v: unknown): v is CampaignLocale =>
  (CAMPAIGN_LOCALES as readonly unknown[]).includes(v);

export interface CampaignPatch {
  name?: string;
  kind?: CampaignKind;
  source_locale?: CampaignLocale;
  link?: string;
  segment?: SegmentSpec;
  segment_id?: string | null;
}

/** Validates a campaign patch from the client (unknown keys / values → invalid). */
export function campaignPatchFrom(input: unknown): CampaignPatch | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  const out: CampaignPatch = {};
  for (const key of Object.keys(v)) {
    const val = v[key];
    if (key === "name") {
      if (typeof val !== "string" || val.trim().length < 3 || val.trim().length > 120) return null;
      out.name = val.trim();
    } else if (key === "kind") {
      if (!(CAMPAIGN_KINDS as readonly unknown[]).includes(val)) return null;
      out.kind = val as CampaignKind;
    } else if (key === "source_locale") {
      if (!isLocale(val)) return null;
      out.source_locale = val;
    } else if (key === "link") {
      if (typeof val !== "string" || !LINK.test(val)) return null;
      out.link = val;
    } else if (key === "segment") {
      if (!segmentValid(val)) return null;
      out.segment = val;
    } else if (key === "segment_id") {
      if (val !== null && !isUuid(val)) return null;
      out.segment_id = val as string | null;
    } else return null;
  }
  return out;
}

export function translationFrom(
  input: unknown,
): { campaignId: string; locale: CampaignLocale; title: string; body: string } | null {
  const v = (input ?? {}) as Record<string, unknown>;
  const title = typeof v["title"] === "string" ? v["title"].trim() : "";
  const body = typeof v["body"] === "string" ? v["body"].trim() : "";
  if (!isUuid(v["campaignId"]) || !isLocale(v["locale"])) return null;
  if (!title || title.length > TITLE_MAX || !body || body.length > BODY_MAX) return null;
  return { campaignId: v["campaignId"], locale: v["locale"], title, body };
}

/** Stable error codes from the database (never raw messages, never content). */
export const CAMPAIGN_ERRORS = [
  "NOTIFICATION_ADMIN_FORBIDDEN",
  "NOTIFICATION_CAMPAIGN_NOT_FOUND",
  "NOTIFICATION_CAMPAIGN_VERSION_CONFLICT",
  "NOTIFICATION_CAMPAIGN_NOT_EDITABLE",
  "NOTIFICATION_CAMPAIGN_STATE",
  "NOTIFICATION_CAMPAIGN_NOT_APPROVED",
  "NOTIFICATION_CAMPAIGN_EMPTY_AUDIENCE",
  "NOTIFICATION_CAMPAIGN_CONFIRMATION_MISMATCH",
  "NOTIFICATION_CAMPAIGN_SCHEDULE_INVALID",
  "NOTIFICATION_CAMPAIGN_NO_TEXT",
  "NOTIFICATION_CAMPAIGN_INVALID",
  "NOTIFICATION_SEGMENT_INVALID",
  "NOTIFICATION_SEGMENT_NOT_FOUND",
  "NOTIFICATION_TEST_RECIPIENT_FORBIDDEN",
  "NOTIFICATION_TEST_RATE_LIMITED",
  "NOTIFICATION_TRANSLATION_NOT_FOUND",
  "NOTIFICATION_RANGE_INVALID",
] as const;
export type CampaignError = (typeof CAMPAIGN_ERRORS)[number] | "UNAVAILABLE" | "FAILED";

export function campaignErrorFrom(
  error: { code?: string; message?: string } | null,
): CampaignError {
  const msg = error?.message ?? "";
  const known = CAMPAIGN_ERRORS.find((c) => msg.includes(c));
  if (known) return known;
  if (error?.code === "42501") return "NOTIFICATION_ADMIN_FORBIDDEN";
  if (error?.code === "42P01" || error?.code === "PGRST202" || error?.code === "PGRST205")
    return "UNAVAILABLE";
  return "FAILED";
}

/** Read rate as a percentage of delivered, or null when nothing was delivered (never 0/0). */
export function readRate(read: number, delivered: number): number | null {
  return delivered > 0 ? Math.round((read / delivered) * 1000) / 10 : null;
}
