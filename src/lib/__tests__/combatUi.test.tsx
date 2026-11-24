/**
 * PM3 / 4.2.5 — duels page states (static render, every locale): EMPTY, NOT_FOUND (IDOR), no
 * participant, legacy telemetry note, provenance attributes, NOT_MEASURED never shown as zero,
 * INSUFFICIENT_SAMPLE with no value, replay deep links; plus the server row mapper and the strict
 * input schema.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/config";
import { buildCombatReport, type CombatEventRow, type CombatInput } from "@/lib/combat/duels";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      children,
      search,
      ...rest
    }: {
      children: ReactNode;
      search?: Record<string, unknown>;
      [k: string]: unknown;
    }) => (
      <a
        data-search={search ? JSON.stringify(search) : undefined}
        data-replay-link={rest["data-replay-link"] as string | undefined}
      >
        {children}
      </a>
    ),
  };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { CombatBody } = await import("@/components/real/RealCombat");
const { combatInput, toCombatRow } = await import("@/lib/combat.functions");
type Resp = import("@/lib/combat.functions").CombatResponse;

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
const noop = () => {};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

const MATCH = "11111111-1111-4111-8111-111111111111";
const ME = "p-me";
const OPP = "p-o1";
const matches = [
  {
    matchId: MATCH,
    map: "de_dust2",
    playedAt: "2026-11-01T00:00:00Z",
    dateSource: "played" as const,
  },
];

let seq = 0;
const ev = (
  over: Partial<CombatEventRow> & Pick<CombatEventRow, "type" | "tick">,
): CombatEventRow => ({
  id: `e${++seq}`,
  roundNumber: 1,
  timeSeconds: null,
  actor: null,
  victim: null,
  weapon: null,
  headshot: null,
  distance: null,
  damage: null,
  hitgroup: null,
  ...over,
});
const input = (events: CombatEventRow[], over: Partial<CombatInput> = {}): CombatInput => ({
  matchId: MATCH,
  rounds: [{ roundNumber: 1, startTick: 0, endTick: 100000, winnerSide: null, winReason: null }],
  roundPlayers: [
    { roundNumber: 1, participantKey: ME, side: "CT" },
    { roundNumber: 1, participantKey: OPP, side: "T" },
  ],
  events,
  shotsAttributed: true,
  hitGroupsRecorded: true,
  ...over,
});
const ok = (i: CombatInput): Resp => ({
  matches,
  status: "OK",
  matchId: MATCH,
  map: "de_dust2",
  telemetry: { shotsAttributed: i.shotsAttributed, hitGroupsRecorded: i.hitGroupsRecorded },
  report: buildCombatReport(i, ME),
});
const oneDuel = [
  ev({ type: "weapon_fire", tick: 640, actor: ME, weapon: "ak47" }),
  ev({
    type: "damage",
    tick: 640,
    actor: ME,
    victim: OPP,
    weapon: "ak47",
    damage: 100,
    hitgroup: "head",
  }),
  ev({
    type: "kill",
    tick: 640,
    actor: ME,
    victim: OPP,
    weapon: "ak47",
    headshot: true,
    distance: 12,
  }),
];

describe("combat page states", () => {
  it.each(LOCALES)(
    "EMPTY / NOT_FOUND / NO_PARTICIPANT render in %s without English leaks",
    (loc) => {
      const empty = render(
        <CombatBody r={{ matches: [], status: "EMPTY" }} onSearch={noop} />,
        loc,
      );
      expect(empty).toContain('data-combat-status="EMPTY"');
      expect(empty).toContain(esc(dictionaries[loc]["combat.empty.title"]));
      const nf = render(<CombatBody r={{ matches, status: "NOT_FOUND" }} onSearch={noop} />, loc);
      expect(nf).toContain('data-combat-status="NOT_FOUND"');
      expect(nf).toContain(esc(dictionaries[loc]["combat.notFound.title"]));
      const np = render(
        <CombatBody r={{ matches, status: "NO_PARTICIPANT", matchId: MATCH }} onSearch={noop} />,
        loc,
      );
      expect(np).toContain('data-combat-status="NO_PARTICIPANT"');
      expect(np).not.toContain("data-metric=");
    },
  );

  it.each(LOCALES)(
    "OK report in %s: provenance, NOT_MEASURED and small samples carry no number",
    (loc) => {
      const html = render(<CombatBody r={ok(input(oneDuel))} onSearch={noop} />, loc);
      expect(html).toContain('data-combat-status="OK"');
      for (const k of ["crosshair_placement", "counter_strafe", "recoil_control"]) {
        expect(html).toMatch(
          new RegExp(`data-metric="${k}"[^>]*data-metric-status="NOT_MEASURED"`),
        );
      }
      // One duel < MIN_SAMPLE: the tile states the reason, never a rate.
      expect(html).toMatch(
        /data-metric="duel_win_rate"[^>]*data-metric-status="INSUFFICIENT_SAMPLE"/,
      );
      expect(html).toContain(esc(dictionaries[loc]["state.INSUFFICIENT_SAMPLE"]));
      expect(html).not.toMatch(/data-metric="duel_win_rate"[^>]*>[^<]*0\s?%/);
      expect(html).toContain("data-provenance-method=");
      expect(html).not.toContain('data-telemetry="LEGACY"');
    },
  );

  it("legacy telemetry note when the match has no attributed shots", () => {
    const html = render(
      <CombatBody
        r={ok(input(oneDuel.slice(1), { shotsAttributed: false, hitGroupsRecorded: false }))}
        onSearch={noop}
      />,
    );
    expect(html).toContain('data-telemetry="LEGACY"');
    expect(html).toMatch(
      /data-metric="shot_hit_rate"[^>]*data-metric-status="(NOT_MEASURED|UNAVAILABLE)"/,
    );
  });

  it("each duel links to the replay on its own match, round and tick", () => {
    const html = render(<CombatBody r={ok(input(oneDuel))} onSearch={noop} />);
    expect(html).toContain('data-duel-outcome="WON"');
    expect(html).toContain('data-duel-opening="true"');
    const m = html.match(/data-search="([^"]+)"[^>]*data-replay-link/);
    expect(m).not.toBeNull();
    const search = JSON.parse(m![1]!.replace(/&quot;/g, '"'));
    expect(search).toEqual({ matchId: MATCH, round: 1, tick: 640 });
    // No other player's identity reaches the page.
    expect(html).not.toContain(OPP);
  });
});

describe("combat server helpers", () => {
  it("toCombatRow keeps null as null and never coerces to zero", () => {
    const r = toCombatRow("damage", {
      id: "x",
      round_number: null,
      tick: 10,
      time_seconds: null,
      actor_steam_id: ME,
      victim_steam_id: null,
      weapon: null,
      damage: null,
      hitgroup: null,
    });
    expect(r).toMatchObject({
      roundNumber: null,
      damage: null,
      hitgroup: null,
      distance: null,
      headshot: null,
    });
  });

  it("input schema is strict and requires a uuid", () => {
    expect(combatInput.parse({})).toEqual({});
    expect(() => combatInput.parse({ matchId: "abc" })).toThrow();
    expect(() => combatInput.parse({ matchId: MATCH, userId: "x" })).toThrow();
  });
});
