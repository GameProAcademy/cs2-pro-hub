/**
 * PM3 / 4.2.6 — utility page states (static render, every locale): EMPTY, NOT_FOUND (IDOR), no
 * participant, telemetry notes (no blinds / legacy / no thrower), provenance attributes,
 * NOT_OBSERVED never shown as zero, flash replay deep links; plus the server row mapper and the
 * strict input schema.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/config";
import { buildUtilityReport, type UtilityEventRow, type UtilityInput } from "@/lib/utility/utility";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, search }: { children: ReactNode; search?: Record<string, unknown> }) => (
      <a data-search={search ? JSON.stringify(search) : undefined} data-replay-link="true">
        {children}
      </a>
    ),
  };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { UtilityBody } = await import("@/components/real/RealUtility");
const { utilityInput, toUtilityRow } = await import("@/lib/utility.functions");
type Resp = import("@/lib/utility.functions").UtilityResponse;

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const noop = () => {};

const MATCH = "22222222-2222-4222-8222-222222222222";
const ME = "p-me";
const OPP = "p-o1";
const matches = [
  {
    matchId: MATCH,
    map: "de_mirage",
    playedAt: "2026-11-01T00:00:00Z",
    dateSource: "played" as const,
  },
];
let seq = 0;
const ev = (
  o: Partial<UtilityEventRow> & Pick<UtilityEventRow, "type" | "tick">,
): UtilityEventRow => ({
  id: `x${++seq}`,
  roundNumber: 1,
  actor: null,
  victim: null,
  weapon: null,
  damage: null,
  flashDuration: null,
  ...o,
});
const input = (events: UtilityEventRow[], over: Partial<UtilityInput> = {}): UtilityInput => ({
  matchId: MATCH,
  rounds: [{ roundNumber: 1, startTick: 0, endTick: 100000, winnerSide: null, winReason: null }],
  roundPlayers: [
    { roundNumber: 1, participantKey: ME, side: "CT" },
    { roundNumber: 1, participantKey: OPP, side: "T" },
  ],
  events,
  throwsAttributed: true,
  blindsRecorded: true,
  detonationsAttributed: true,
  fireRecorded: true,
  flashAssists: null,
  flashAssistMethod: null,
  ...over,
});
const ok = (i: UtilityInput): Resp => {
  const { throwsAttributed, blindsRecorded, detonationsAttributed, fireRecorded } = i;
  return {
    matches,
    status: "OK",
    matchId: MATCH,
    map: "de_mirage",
    telemetry: { throwsAttributed, blindsRecorded, detonationsAttributed, fireRecorded },
    report: buildUtilityReport(i, ME),
  };
};
const twoFlashes = [
  ev({ type: "flash", tick: 640, actor: ME }),
  ev({ type: "flash", tick: 640, actor: ME, victim: OPP, flashDuration: 2.4 }),
  ev({ type: "flash", tick: 900, actor: ME }),
];

describe("utility page states", () => {
  it.each(LOCALES)("EMPTY / NOT_FOUND / NO_PARTICIPANT render in %s", (loc) => {
    const empty = render(<UtilityBody r={{ matches: [], status: "EMPTY" }} onSearch={noop} />, loc);
    expect(empty).toContain('data-utility-status="EMPTY"');
    expect(empty).toContain(esc(dictionaries[loc]["nade.empty.description"]));
    const nf = render(<UtilityBody r={{ matches, status: "NOT_FOUND" }} onSearch={noop} />, loc);
    expect(nf).toContain('data-utility-status="NOT_FOUND"');
    const np = render(
      <UtilityBody r={{ matches, status: "NO_PARTICIPANT", matchId: MATCH }} onSearch={noop} />,
      loc,
    );
    expect(np).toContain('data-utility-status="NO_PARTICIPANT"');
    expect(np).not.toContain("data-metric=");
  });

  it.each(LOCALES)(
    "OK report in %s: provenance, flash rows, small samples carry no number",
    (loc) => {
      const html = render(<UtilityBody r={ok(input(twoFlashes))} onSearch={noop} />, loc);
      expect(html).toContain('data-utility-status="OK"');
      expect(html).toContain("data-provenance-method=");
      expect(html).toMatch(
        /data-metric="utility.flash_effective_rate"[^>]*data-metric-status="INSUFFICIENT_SAMPLE"/,
      );
      expect(html).toContain('data-flash-list="OK"');
      expect(html).toContain('data-flash-enemies="1"');
      expect(html).toContain('data-flash-enemies="0"');
      expect(html).toContain(esc(dictionaries[loc]["nade.noEffect"]));
      expect(html).not.toContain("data-telemetry=");
      // No other player's identity reaches the page.
      expect(html).not.toContain(OPP);
    },
  );

  it("HLTV-style match without blinds: note shown, effect NOT_OBSERVED, list not offered", () => {
    const html = render(
      <UtilityBody
        r={ok(
          input(
            twoFlashes.filter((e) => !e.victim),
            { blindsRecorded: false },
          ),
        )}
        onSearch={noop}
      />,
    );
    expect(html).toContain('data-telemetry="NO_BLINDS"');
    expect(html).toMatch(
      /data-metric="utility.enemies_blinded_per_flash"[^>]*data-metric-status="NOT_OBSERVED"/,
    );
    expect(html).toContain('data-flash-list="NOT_OBSERVED"');
  });

  it("legacy match: throws and fire NOT_OBSERVED, shown as such (never 0)", () => {
    const html = render(
      <UtilityBody
        r={ok(input(twoFlashes, { throwsAttributed: false, fireRecorded: false }))}
        onSearch={noop}
      />,
    );
    expect(html).toContain('data-telemetry="LEGACY"');
    expect(html).toMatch(
      /data-grenade="flash"[^>]*data-throws="NOT_OBSERVED"[^>]*data-detonations="2"/,
    );
    expect(html).toMatch(
      /data-grenade="fire"[^>]*data-throws="NOT_OBSERVED"[^>]*data-detonations="NOT_OBSERVED"/,
    );
  });

  it("each flash links to the replay on its own match, round and detonation tick", () => {
    const html = render(<UtilityBody r={ok(input(twoFlashes))} onSearch={noop} />);
    const links = [...html.matchAll(/data-search="([^"]+)"/g)].map((m) =>
      JSON.parse(m[1]!.replace(/&quot;/g, '"')),
    );
    expect(links).toEqual([
      { matchId: MATCH, round: 1, tick: 640 },
      { matchId: MATCH, round: 1, tick: 900 },
    ]);
  });
});

describe("utility server helpers", () => {
  it("toUtilityRow parses the text flash duration and keeps absent values null", () => {
    const base = {
      id: "r",
      event_type: "flash",
      round_number: 2,
      tick: 5,
      actor_steam_id: ME,
      victim_steam_id: OPP,
      weapon: null,
    };
    expect(toUtilityRow({ ...base, flash_duration: "2.5" })!.flashDuration).toBe(2.5);
    expect(toUtilityRow({ ...base, flash_duration: null })!.flashDuration).toBeNull();
    expect(toUtilityRow({ ...base, flash_duration: "abc" })!.flashDuration).toBeNull();
    expect(toUtilityRow({ ...base, damage: null })!.damage).toBeNull();
    expect(toUtilityRow({ ...base, event_type: "round_end" })).toBeNull();
  });

  it("input schema is strict and requires a uuid", () => {
    expect(utilityInput.parse({})).toEqual({});
    expect(() => utilityInput.parse({ matchId: "x" })).toThrow();
    expect(() => utilityInput.parse({ matchId: MATCH, participant: "x" })).toThrow();
  });
});
