/**
 * PM4 / 4.2.7 — round review page states (static render, every locale): EMPTY, NOT_FOUND (IDOR),
 * no participant, spend not recorded (buy never shown as eco), disconnect note, coverage with
 * exclusion reasons, empty denominators never 0 %, no other player's identity, replay deep links;
 * plus the jsonb number-map reader and the strict input schema.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/config";
import {
  buildRoundReports,
  summarizeRounds,
  type RoundKill,
  type RoundsInput,
} from "@/lib/rounds/roundImpact";

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
const { RoundsBody } = await import("@/components/real/RealRounds");
const { roundsInput, numberMap } = await import("@/lib/rounds.functions");
type Resp = import("@/lib/rounds.functions").RoundsResponse;

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const noop = () => {};

const MATCH = "33333333-3333-4333-8333-333333333333";
const ME = "7656000000000000001";
const T = [ME, "t-ally-1", "t-ally-2", "t-ally-3", "t-ally-4"];
const CT = ["ct-opp-0", "ct-opp-1", "ct-opp-2", "ct-opp-3", "ct-opp-4"];
const matches = [
  {
    matchId: MATCH,
    map: "de_nuke",
    playedAt: "2026-11-01T00:00:00Z",
    dateSource: "played" as const,
  },
];
let seq = 0;
const kill = (round: number, tick: number, actor: string | null, victim: string): RoundKill => ({
  id: `k${++seq}`,
  roundNumber: round,
  tick,
  timeSeconds: tick / 64,
  actor,
  victim,
  assister: null,
  weapon: "ak47",
  headshot: false,
});
const input = (kills: RoundKill[], spend = true, rounds = [1, 2]): RoundsInput => ({
  matchId: MATCH,
  rounds: rounds.map((n) => ({
    roundNumber: n,
    startTick: n * 10000,
    endTick: n * 10000 + 9000,
    winnerSide: "T",
    winReason: null,
  })),
  roundPlayers: rounds.flatMap((n) => [
    ...T.map((k) => ({
      roundNumber: n,
      participantKey: k,
      side: "T" as const,
      moneyStart: 4000,
      equipmentStart: 1000,
    })),
    ...CT.map((k) => ({
      roundNumber: n,
      participantKey: k,
      side: "CT" as const,
      moneyStart: 4000,
      equipmentStart: 1000,
    })),
  ]),
  kills,
  damage: [],
  objectives: [],
  roundEnds: rounds.map((n) => ({
    roundNumber: n,
    moneySpent: spend ? Object.fromEntries([...T, ...CT].map((k) => [k, 3000])) : null,
    disconnected: null,
  })),
});
const ok = (i: RoundsInput, spendRecorded = true): Resp => {
  const rounds = buildRoundReports(i, ME);
  return {
    matches,
    status: "OK",
    matchId: MATCH,
    map: "de_nuke",
    spendRecorded,
    summary: summarizeRounds(rounds),
    rounds,
  };
};

describe("rounds page states", () => {
  it.each(LOCALES)("EMPTY / NOT_FOUND / NO_PARTICIPANT render in %s", (loc) => {
    const empty = render(<RoundsBody r={{ matches: [], status: "EMPTY" }} onSearch={noop} />, loc);
    expect(empty).toContain('data-rounds-status="EMPTY"');
    expect(empty).toContain(esc(dictionaries[loc]["rounds.empty.description"]));
    const nf = render(<RoundsBody r={{ matches, status: "NOT_FOUND" }} onSearch={noop} />, loc);
    expect(nf).toContain('data-rounds-status="NOT_FOUND"');
    expect(nf).not.toContain("data-round-list");
    const np = render(
      <RoundsBody r={{ matches, status: "NO_PARTICIPANT", matchId: MATCH }} onSearch={noop} />,
      loc,
    );
    expect(np).toContain('data-rounds-status="NO_PARTICIPANT"');
    expect(np).not.toContain("data-rate=");
  });

  it.each(LOCALES)("OK report in %s: team and player sections apart, no other identity", (loc) => {
    const html = render(
      <RoundsBody r={ok(input([kill(1, 10100, ME, "ct-opp-0")]))} onSearch={noop} />,
      loc,
    );
    expect(html).toContain('data-rounds-status="OK"');
    expect(html).toContain('data-rounds-section="team"');
    expect(html).toContain('data-rounds-section="me"');
    expect(html).toContain('data-rounds-note="COVERAGE"');
    expect(html).toContain('data-buy="full_buy"');
    expect(html).toContain(esc(dictionaries[loc]["rounds.teamNotCausal"]));
    expect(html).not.toContain('data-rounds-note="NO_SPEND"');
    for (const k of [...T.slice(1), ...CT, ME]) expect(html).not.toContain(k);
  });

  it("empty denominators read 'no eligible rounds', never 0 %", () => {
    const html = render(<RoundsBody r={ok(input([]))} onSearch={noop} />);
    expect(html).toMatch(/data-rate="retakeCt" data-rate-status="NO_SAMPLE"/);
    expect(html).toMatch(/data-rate="deathsTraded" data-rate-status="NO_SAMPLE"/);
    expect(html).not.toMatch(/\(0%\)/);
  });

  it("spend not recorded: NO_SPEND note, buys UNKNOWN, never eco", () => {
    const html = render(<RoundsBody r={ok(input([], false), false)} onSearch={noop} />);
    expect(html).toContain('data-rounds-note="NO_SPEND"');
    expect(html).not.toContain('data-buy="eco"');
    expect(html).toContain('data-buy="UNKNOWN"');
    expect(html).toContain(esc(dictionaries["pt-BR"]["rounds.unknownBuyRounds"]));
  });

  it("disconnect and invalid rounds are surfaced with their reasons", () => {
    const i = input([kill(2, 20100, ME, "ghost")]);
    i.roundEnds[0]!.disconnected = { "t-ally-1": 10500 };
    const html = render(<RoundsBody r={ok(i)} onSearch={noop} />);
    expect(html).toContain('data-rounds-note="DISCONNECT"');
    expect(html).toContain('data-round-valid="false"');
    expect(html).toContain(esc(dictionaries["pt-BR"]["rounds.invalid.KILL_DATA"]));
  });

  it("each timeline event opens the replay on its own match, round and tick", () => {
    const html = render(
      <RoundsBody
        r={ok(input([kill(1, 10100, ME, "ct-opp-0"), kill(2, 20200, "ct-opp-1", ME)]))}
        onSearch={noop}
      />,
    );
    const all = [...html.matchAll(/data-search="([^"]+)"/g)].map(
      (m) => JSON.parse(m[1]!.replace(/&quot;/g, '"')) as Record<string, unknown>,
    );
    // VGL 4.0: the round in focus adds its own "open in replay" link for the selected round
    // (match room tab, no tick); the per-event links are the ones with a tick.
    expect(all).toContainEqual({ tab: "replay", round: 1 });
    const links = all.filter((l) => "tick" in l);
    expect(links).toEqual([
      { matchId: MATCH, round: 1, tick: 10100 },
      { matchId: MATCH, round: 2, tick: 20200 },
    ]);
  });
});

describe("rounds server helpers", () => {
  it("numberMap keeps finite numbers only and never returns an empty map", () => {
    expect(numberMap({ a: 1, b: "2", c: null, d: Number.NaN })).toEqual({ a: 1 });
    expect(numberMap({})).toBeNull();
    expect(numberMap(null)).toBeNull();
    expect(numberMap([1, 2])).toBeNull();
    expect(numberMap("x")).toBeNull();
  });

  it("input schema is strict and requires a uuid", () => {
    expect(roundsInput.parse({})).toEqual({});
    expect(() => roundsInput.parse({ matchId: "x" })).toThrow();
    expect(() => roundsInput.parse({ matchId: MATCH, owner: "x" })).toThrow();
  });
});
