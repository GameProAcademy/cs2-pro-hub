/**
 * VGL 2.0 continuation — Metas, Perfil and Notificações. Goals are grouped by the server's own
 * status and show its value (null stays "—"); the profile hero names a "most played" map only when
 * one strictly leads and shows no e-mail; notifications are grouped by day with unread emphasis.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import type { GoalView, NotificationView } from "@/lib/notifications/notifications.functions";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: ReactNode }) => <a>{children}</a> };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { GoalsPanel } = await import("@/components/notifications/GoalsPanel");
const { NotificationCenter } = await import("@/components/notifications/NotificationComponents");
const { ProfileHero, leadingMap } = await import("@/components/profile/ProfileHero");

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, seed?: (qc: QueryClient) => void, locale: Locale = "pt-BR") => {
  const qc = new QueryClient();
  seed?.(qc);
  return renderToString(
    <QueryClientProvider client={qc}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
};

const goal = (
  id: string,
  status: GoalView["progress"]["status"],
  value: number | null,
): GoalView => ({
  id,
  playerId: "p",
  metric: "adr",
  direction: "AT_LEAST",
  target: 85,
  windowMatches: 5,
  deadline: null,
  reminder: "OFF",
  reminderWeekday: null,
  progress: {
    status,
    value,
    sample: value === null ? 0 : 5,
    window: 5,
    periodFrom: null,
    periodTo: null,
    matchIds: [],
  },
});

describe("VGL 2.0 Metas", () => {
  it("active and reached goals are separate sections; null value stays —", () => {
    const html = render(<GoalsPanel />, (qc) =>
      qc.setQueryData(["goals"], {
        available: true,
        hasPlayer: true,
        updatedAt: "2026-11-20T10:00:00Z",
        goals: [
          goal("a", "NO_DATA", null),
          goal("b", "IN_PROGRESS", 80.4),
          goal("c", "REACHED", 90),
        ],
        achievements: [],
      }),
    );
    expect(html).toContain('data-goals-group="ACTIVE"');
    expect(html).toContain('data-goals-group="REACHED"');
    const active = html.slice(
      html.indexOf('data-goals-group="ACTIVE"'),
      html.indexOf('data-goals-group="REACHED"'),
    );
    expect(active.match(/data-goal-card=/g)).toHaveLength(2);
    expect(active).toContain('data-goal-card="NO_DATA"');
    expect(active).toContain("80,4");
    const noData = active.slice(
      active.indexOf('data-goal-card="NO_DATA"'),
      active.indexOf('data-goal-card="IN_PROGRESS"'),
    );
    expect(noData).toContain("—");
    expect(noData).not.toMatch(/>0<|>0,0</);
  });

  it("goal labels exist in every locale", () => {
    for (const l of LOCALES)
      for (const k of [
        "vgl.goals.group.ACTIVE",
        "vgl.goals.group.REACHED",
        "vgl.goals.current",
        "vgl.goals.target",
      ])
        expect(dictionaries[l][k as keyof (typeof dictionaries)["pt-BR"]]).toBeTruthy();
  });
});

describe("VGL 2.0 Perfil", () => {
  it("leading map only when strictly ahead", () => {
    expect(leadingMap([{ map: "de_nuke" }, { map: "de_nuke" }, { map: "de_inferno" }])).toEqual({
      map: "de_nuke",
      matches: 2,
    });
    expect(leadingMap([{ map: "de_nuke" }, { map: "de_inferno" }])).toBeNull();
    expect(leadingMap([{ map: null }])).toBeNull();
  });

  it("hero shows saved identity and counts; no map claim on a tie", () => {
    const html = render(
      <ProfileHero
        avatarSource={null}
        displayName="Ana"
        nickname="ana_cs"
        team="Time X"
        level="Intermediário"
        platform="FACEIT"
        roles={["Entry"]}
        matches={[{ map: "de_nuke" }, { map: "de_inferno" }]}
      />,
    );
    expect(html).toContain("data-profile-hero");
    expect(html).toContain("Ana");
    expect(html).toContain("ana_cs");
    expect(html).toContain("data-profile-hero-matches");
    expect(html).not.toContain("data-profile-hero-map=");
    expect(html).not.toContain("@");
  });

  it("no overview: no match count rendered (not 0)", () => {
    const html = render(
      <ProfileHero
        avatarSource={null}
        displayName={null}
        nickname={null}
        team={null}
        level={null}
        platform={null}
        roles={[]}
        matches={null}
      />,
    );
    expect(html).not.toContain("data-profile-hero-matches");
    expect(html).toContain(dictionaries["pt-BR"]["vgl.profile.hero.noName"]);
  });
});

describe("VGL 2.0 Notificações", () => {
  const n = (
    id: string,
    createdAt: string,
    readAt: string | null,
    type = "analysis_ready",
  ): NotificationView => ({
    id,
    category: "analysis_ready",
    type,
    params: {},
    link: "/matches",
    createdAt,
    readAt,
    content: { title: `T-${id}`, body: "b" },
  });

  it("grouped by day, unread emphasised, failures in attention tone", () => {
    const html = render(<NotificationCenter />, (qc) =>
      qc.setQueryData(["notifications", "center", null, false, "pt-BR"], {
        pages: [
          {
            available: true,
            unread: 1,
            nextCursor: null,
            items: [
              n("1", "2026-11-20T15:00:00Z", null),
              n("2", "2026-11-20T09:00:00Z", "2026-11-20T10:00:00Z", "demo_failed"),
              n("3", "2026-11-18T09:00:00Z", "2026-11-18T10:00:00Z"),
            ],
          },
        ],
        pageParams: [null],
      }),
    );
    expect(html.match(/data-notification-day/g)).toHaveLength(2);
    expect(html).toContain('data-notification-item="unread"');
    expect(html.match(/data-notification-item="read"/g)).toHaveLength(2);
    expect(html).toContain("bg-warning");
    expect(html).toContain('data-notification-unread="1"');
  });

  it("day header uses the same time zone as the item's time (no 22:21 under the next day)", () => {
    const src = readFileSync(
      resolve("src/components/notifications/NotificationComponents.tsx"),
      "utf8",
    );
    const body = src.slice(
      src.indexOf("function groupByDay"),
      src.indexOf("export function NotificationCenter"),
    );
    expect(body).toContain('new Intl.DateTimeFormat(intlTag, { dateStyle: "short" })');
    expect(body).not.toContain("timeZone");
    expect(body).not.toContain("formatDate(");
  });
});
