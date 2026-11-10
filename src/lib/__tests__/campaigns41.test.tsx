/**
 * Fase 4.1 — Admin Notification Center: pure validators mirror the SQL, the UI only offers what
 * the caller's role may do, every label exists in 5 locales, campaign texts reach players only
 * through approved translations, and the server functions never escalate privileges.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import {
  ACTION_RULES,
  CAMPAIGN_ACTIONS,
  CAMPAIGN_ERRORS,
  CAMPAIGN_KINDS,
  CAMPAIGN_STATUSES,
  SEGMENT_FIELDS,
  availableActions,
  campaignErrorFrom,
  campaignPatchFrom,
  readRate,
  segmentValid,
  translationFrom,
} from "@/lib/notifications/campaigns";
import { actionFrom, rangeFrom } from "@/lib/notifications/campaigns.functions";
import {
  campaignContent,
  listInputFrom,
  prefsInputFrom,
} from "@/lib/notifications/notifications.functions";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { SegmentBuilder } = await import("@/components/admin/NotificationAdmin");
const { notificationText } = await import("@/components/notifications/NotificationComponents");

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const SQL = read("supabase/migrations/20261106120000_admin_notification_center.sql");
const ID = "4f0c2a8e-1d2b-4c3d-9e8f-0a1b2c3d4e5f";

describe("segment rules (mirror notification_segment_valid)", () => {
  it("accepts whitelisted rules, AND/OR and one nested group", () => {
    expect(segmentValid({ op: "AND", rules: [] })).toBe(true);
    expect(
      segmentValid({
        op: "AND",
        rules: [
          { field: "locale", op: "in", value: ["en", "pt-BR"] },
          { field: "country", op: "in", value: ["BR"] },
          { field: "processed_demos", op: "gte", value: 1 },
          {
            op: "OR",
            rules: [
              { field: "steam_linked", op: "eq", value: true },
              { field: "last_login_days", op: "lte", value: 30 },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it.each([
    ["unknown field", { op: "AND", rules: [{ field: "email", op: "eq", value: "x" }] }],
    [
      "SQL in a value",
      { op: "AND", rules: [{ field: "locale", op: "in", value: ["en'); DROP TABLE x; --"] }] },
    ],
    [
      "string where a number is expected",
      { op: "AND", rules: [{ field: "processed_demos", op: "gte", value: "1 OR 1=1" }] },
    ],
    ["unknown combinator", { op: "XOR", rules: [] }],
    ["two nesting levels", { op: "AND", rules: [{ op: "OR", rules: [{ op: "AND", rules: [] }] }] }],
    ["lower-case country", { op: "AND", rules: [{ field: "country", op: "in", value: ["bra"] }] }],
    [
      "fractional days",
      { op: "AND", rules: [{ field: "account_age_days", op: "gte", value: 1.5 }] },
    ],
    ["wrong operator", { op: "AND", rules: [{ field: "has_goal", op: "gte", value: 1 }] }],
    [
      "too many rules",
      { op: "AND", rules: Array(21).fill({ field: "has_goal", op: "eq", value: true }) },
    ],
  ])("rejects %s", (_name, spec) => {
    expect(segmentValid(spec)).toBe(false);
  });

  it("every TS field is handled by the SQL evaluator and validator", () => {
    for (const f of Object.keys(SEGMENT_FIELDS)) {
      expect(SQL).toContain(`WHEN '${f}' THEN`);
      expect(SQL).toContain(`'${f}'`);
    }
  });
});

describe("state machine and permissions", () => {
  it("ACTION_RULES equals the SQL CASE (level and allowed states)", () => {
    for (const a of CAMPAIGN_ACTIONS) {
      const line = SQL.split("\n").find((l) => l.includes(`WHEN '${a}'`) && l.includes("v_need"));
      expect(line, a).toBeDefined();
      expect(line).toContain(`v_need := ${ACTION_RULES[a].level};`);
      const states = [...line!.matchAll(/'([A-Z]+)'/g)].map((m) => m[1]);
      const from = line!.slice(line!.indexOf("ARRAY["), line!.indexOf("]") + 1);
      expect(from.match(/'([A-Z]+)'/g)!.map((s) => s.slice(1, -1))).toEqual(ACTION_RULES[a].from);
      expect(states.length).toBeGreaterThan(0);
    }
  });

  it("an admin (level 1) is never offered schedule, pause, cancel, resume or retry", () => {
    for (const s of CAMPAIGN_STATUSES)
      for (const a of availableActions(s, 1)) expect(["archive", "duplicate"]).toContain(a);
    expect(availableActions("DRAFT", 2)).toContain("schedule");
    expect(availableActions("SENT", 2)).not.toContain("schedule");
    expect(availableActions("DRAFT", 0)).toEqual([]);
  });
});

describe("inputs", () => {
  it("campaign patch: unknown keys, external links, bad kinds and short names are invalid", () => {
    expect(campaignPatchFrom({ name: "Launch", kind: "product" })).toEqual({
      name: "Launch",
      kind: "product",
    });
    expect(campaignPatchFrom({ name: "Launch", status: "SENT" })).toBeNull();
    expect(campaignPatchFrom({ link: "https://evil.example" })).toBeNull();
    expect(campaignPatchFrom({ link: "//evil.example" })).toBeNull();
    expect(campaignPatchFrom({ kind: "spam" })).toBeNull();
    expect(campaignPatchFrom({ name: "ab" })).toBeNull();
    expect(campaignPatchFrom({ segment: { op: "AND", rules: [{ field: "sql" }] } })).toBeNull();
  });

  it("translation: trimmed, bounded, known locale and campaign id", () => {
    expect(
      translationFrom({ campaignId: ID, locale: "fr", title: " Titre ", body: " Texte " }),
    ).toEqual({
      campaignId: ID,
      locale: "fr",
      title: "Titre",
      body: "Texte",
    });
    expect(translationFrom({ campaignId: ID, locale: "de", title: "t", body: "b" })).toBeNull();
    expect(
      translationFrom({ campaignId: ID, locale: "en", title: "x".repeat(81), body: "b" }),
    ).toBeNull();
    expect(
      translationFrom({ campaignId: ID, locale: "en", title: "t", body: "x".repeat(281) }),
    ).toBeNull();
    expect(translationFrom({ campaignId: "nope", locale: "en", title: "t", body: "b" })).toBeNull();
  });

  it("actions and ranges", () => {
    expect(
      actionFrom({ id: ID, action: "schedule", version: 3, args: { confirm_audience: 9 } }),
    ).toEqual({
      id: ID,
      action: "schedule",
      version: 3,
      args: { confirm_audience: 9 },
    });
    expect(actionFrom({ id: ID, action: "delete", version: 1 })).toBeNull();
    expect(actionFrom({ id: ID, action: "pause", version: 0 })).toBeNull();
    expect(
      actionFrom({ id: ID, action: "schedule", version: 1, args: { confirm_audience: "9" } }),
    ).toBeNull();
    expect(rangeFrom({ from: "2026-11-01", to: "2026-11-02" })).not.toBeNull();
    expect(rangeFrom({ from: "2026-11-02", to: "2026-11-01" })).toBeNull();
    expect(rangeFrom({ from: "2025-01-01", to: "2026-11-01" })).toBeNull();
  });

  it("errors map to stable codes, never raw database text", () => {
    expect(campaignErrorFrom({ message: "ERROR: NOTIFICATION_CAMPAIGN_STATE detail" })).toBe(
      "NOTIFICATION_CAMPAIGN_STATE",
    );
    expect(campaignErrorFrom({ code: "42501", message: "permission denied" })).toBe(
      "NOTIFICATION_ADMIN_FORBIDDEN",
    );
    expect(campaignErrorFrom({ code: "PGRST202", message: "no function" })).toBe("UNAVAILABLE");
    expect(campaignErrorFrom({ message: "something else" })).toBe("FAILED");
    for (const code of CAMPAIGN_ERRORS) expect(SQL).toContain(code);
  });

  it("read rate is never 0/0", () => {
    expect(readRate(0, 0)).toBeNull();
    expect(readRate(1, 3)).toBe(33.3);
  });
});

describe("players: categories, consent, campaign text", () => {
  const base = {
    categories: {
      demo_processing: true,
      analysis_ready: true,
      evolution: true,
      training: true,
      coach: true,
      operational: true,
    },
    pauseHours: 0,
    maxPerDay: 10,
  };
  it("announcements switch is optional for older clients; marketing is never a category switch", () => {
    expect(prefsInputFrom(base)).toMatchObject({ ok: true });
    expect(prefsInputFrom(base)).not.toHaveProperty("marketingConsent");
    expect(
      prefsInputFrom({ ...base, categories: { ...base.categories, announcements: false } }),
    ).toMatchObject({ ok: true, categories: { announcements: false } });
    expect(prefsInputFrom({ ...base, marketingConsent: true })).toMatchObject({
      marketingConsent: true,
    });
    expect(prefsInputFrom({ ...base, marketingConsent: "yes" })).toEqual({ ok: false });
    expect(
      (
        prefsInputFrom({ ...base, categories: { ...base.categories, marketing: true } }) as {
          categories?: Record<string, boolean>;
        }
      ).categories?.["marketing"],
    ).toBeUndefined();
  });

  it("the reader's language, else the source language, else the generic notice", () => {
    const rows = [
      { campaign_id: ID, locale: "pt-BR", title: "Novidade", body: "Texto" },
      { campaign_id: ID, locale: "en", title: "News", body: "Text" },
    ];
    expect(campaignContent(rows, ID, "en", "pt-BR")).toEqual({ title: "News", body: "Text" });
    expect(campaignContent(rows, ID, "fr", "pt-BR")).toEqual({ title: "Novidade", body: "Texto" });
    expect(campaignContent(rows, "other", "en", "pt-BR")).toBeNull();
    expect(listInputFrom({ locale: "xx" }).locale).toBe("pt-BR");
  });

  it("notificationText shows the approved content or the localized generic notice", () => {
    const t = (k: string) => (dictionaries.en as Record<string, string>)[k] ?? k;
    expect(
      notificationText(
        { type: "campaign", params: {}, content: { title: "A", body: "B" } } as never,
        t as never,
      ),
    ).toEqual({ title: "A", body: "B" });
    expect(
      notificationText({ type: "campaign", params: {}, content: null } as never, t as never),
    ).toEqual({
      title: "News from CS2 PRO",
      body: "Open to see the details.",
    });
  });
});

describe("i18n: every admin and campaign label in 5 locales", () => {
  const dynamic = [
    ...CAMPAIGN_STATUSES.map((s) => `adminNotify.status.${s}`),
    ...CAMPAIGN_KINDS.flatMap((k) => [`adminNotify.kind.${k}`, `adminNotify.kindHint.${k}`]),
    ...CAMPAIGN_ACTIONS.flatMap((a) => [`adminNotify.action.${a}`, `adminNotify.done.${a}`]),
    ...[...CAMPAIGN_ERRORS, "UNAVAILABLE", "FAILED"].map((e) => `adminNotify.error.${e}`),
    ...Object.keys(SEGMENT_FIELDS).map((f) => `adminNotify.field.${f}`),
    ...["in", "gte", "lte", "eq"].map((o) => `adminNotify.op.${o}`),
    ...["ACCEPTED", "SUPPRESSED", "REJECTED"].map((s) => `adminNotify.eventStatus.${s}`),
    ...[
      "PREFERENCE_DISABLED",
      "PAUSED",
      "DAILY_LIMIT",
      "INVALID_EVENT",
      "INVALID_VERSION",
      "NO_MARKETING_CONSENT",
      "FREQUENCY_LIMIT",
    ].map((r) => `adminNotify.reason.${r}`),
    ...["dashboard", "campaigns", "audiences"].map((x) => `adminNotify.tab.${x}`),
    "notify.cat.announcements",
    "notify.cat.marketing",
    "notify.type.campaign.title",
    "notify.type.campaign.body",
    "notify.prefs.marketing",
    "notify.prefs.marketingHint",
  ];
  it.each(LOCALES)("%s", (locale) => {
    const d = dictionaries[locale] as Record<string, string>;
    for (const key of dynamic) expect(d[key], `${locale} ${key}`).toBeTruthy();
    const keys = Object.keys(dictionaries["pt-BR"]).filter((k) => k.startsWith("adminNotify."));
    for (const key of keys) expect(d[key], `${locale} ${key}`).toBeTruthy();
    expect(d["adminNotify.confirmPrompt"]).toContain("{n}");
  });
});

describe("UI and wiring", () => {
  it("segment builder renders accessible, labelled controls", () => {
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider initialLocale="pt-BR">
          <SegmentBuilder
            value={{ op: "AND", rules: [{ field: "locale", op: "in", value: ["en"] }] }}
            onChange={() => {}}
          />
        </I18nProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain("Combinar regras com");
    expect(html).toContain('aria-label="Remover"');
  });

  it("admin server functions use the caller's session, never the service role", () => {
    const src = read("src/lib/notifications/campaigns.functions.ts");
    expect(src).toContain("requireSupabaseAuth");
    expect(src).not.toMatch(/service_role|supabaseAdmin|SERVICE_ROLE/);
    expect(src).not.toMatch(/\.from\("notification_campaigns"\)\s*\.(insert|update|upsert|delete)/);
    expect(src).toContain('"notification_campaign_test_send"');
    expect(src).toContain("p_recipient: null");
  });

  it("route and navigation are registered; nothing auto-sends", () => {
    expect(read("src/routeTree.gen.ts")).toContain("/_authenticated/admin/notifications");
    expect(read("src/routeTree.gen.ts")).toContain("declare module '@tanstack/react-start'");
    expect(read("src/components/admin/AdminShell.tsx")).toContain('"/admin/notifications"');
    expect(SQL).toContain("cron.schedule('notification-campaigns'");
    expect(SQL).toContain("NOTIFICATION_CAMPAIGN_CONFIRMATION_MISMATCH");
  });
});
