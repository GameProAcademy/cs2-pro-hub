/**
 * VGL 3.0 — Match Timeline family. The kill feed draws one line per real timeline item; who acted
 * follows the report (you / teammate / opponent / unknown); the weapon gets art only when the name is
 * unambiguous; marks appear only for real round facts; the score shows "not determined", never 0 : 0.
 */
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  KillFeedLine,
  RoundJump,
  RoundMarks,
  ScoreLine,
  feedWho,
} from "@/components/cs2/MatchTimeline";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import type { RoundReport, TimelineItem } from "@/lib/rounds/roundImpact";

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);

const kill = (o: Partial<TimelineItem> = {}): TimelineItem => ({
  tick: 100,
  type: "kill",
  side: "T",
  victimSide: "CT",
  kind: "ENEMY",
  byMe: false,
  onMe: false,
  weapon: "ak47",
  headshot: false,
  traded: false,
  alive: null,
  ...o,
});

const round = (o: Partial<RoundReport> = {}): RoundReport =>
  ({
    roundNumber: 1,
    valid: true,
    invalidReason: null,
    overtime: false,
    side: "CT",
    won: true,
    winReason: null,
    disconnect: false,
    economy: { teams: {}, player: null },
    opening: {
      status: "NO_DEATH",
      teamWon: null,
      kind: null,
      byMe: false,
      onMe: false,
      tick: null,
    },
    advantage: { status: "NOT_MEASURED", held: null, disadvantage: null },
    clutch: null,
    postPlant: null,
    me: null,
    timeline: [],
    ...o,
  }) as RoundReport;

describe("feedWho", () => {
  it("follows the report: me, unknown side, teammate, opponent", () => {
    expect(feedWho("CT", true, "CT")).toBe("me");
    expect(feedWho(null, false, "CT")).toBe("unknown");
    expect(feedWho("CT", false, "CT")).toBe("team");
    expect(feedWho("T", false, "CT")).toBe("enemy");
  });
});

describe("KillFeedLine", () => {
  it("your kill: lime frame, art for an unambiguous weapon, headshot mark, full sentence kept", () => {
    const html = render(
      <KillFeedLine
        e={kill({ side: "CT", victimSide: "T", byMe: true, weapon: "awp", headshot: true })}
        mySide="CT"
        sentence="Você eliminou Adversário · awp"
      />,
    );
    expect(html).toContain('data-feed-me="kill"');
    expect(html).toContain("border-primary/70");
    expect(html).toContain("weapons/awp.svg");
    expect(html).toContain("data-feed-headshot");
    expect(html).toContain('data-feed-who="me"');
    expect(html).toContain('data-feed-who="enemy"');
    expect(html).toContain("Você eliminou Adversário · awp");
  });

  it("ambiguous or missing weapon: no art, the name or — as text", () => {
    const amb = render(<KillFeedLine e={kill({ weapon: "m4a1" })} mySide="CT" sentence="s" />);
    expect(amb).not.toContain("weapons/m4a1.svg");
    expect(amb).toContain(">m4a1<");
    const none = render(<KillFeedLine e={kill({ weapon: null })} mySide="CT" sentence="s" />);
    expect(none).toContain(">—<");
    expect(none).not.toContain("data-feed-headshot");
  });

  it("your death: critical frame; unknown side stays neutral", () => {
    const html = render(
      <KillFeedLine e={kill({ side: null, onMe: true })} mySide="CT" sentence="s" />,
    );
    expect(html).toContain('data-feed-me="death"');
    expect(html).toContain('data-feed-side="unknown"');
    expect(html).toContain('data-feed-who="unknown"');
  });

  it("bomb events and traded deaths", () => {
    const plant = render(
      <KillFeedLine e={kill({ type: "bomb_plant", weapon: null })} mySide="T" sentence="Plantou" />,
    );
    expect(plant).toContain('data-feed-line="bomb_plant"');
    expect(plant).toContain("icon_c4_default");
    const traded = render(<KillFeedLine e={kill({ traded: true })} mySide="T" sentence="s" />);
    expect(traded).toContain(dictionaries["pt-BR"]["rounds.tag.traded"]);
  });
});

describe("RoundMarks and RoundJump", () => {
  it("marks only real facts", () => {
    expect(render(<RoundMarks r={round()} />)).toContain('data-round-marks="none"');
    const html = render(
      <RoundMarks
        r={round({
          opening: { status: "OK", teamWon: true, kind: "ENEMY", byMe: true, onMe: false, tick: 1 },
          clutch: { opponents: 2, won: true, tick: 5 },
          postPlant: { tick: 9, plantedBy: "ENEMY", alive: null, defused: true, exploded: false },
        })}
      />,
    );
    expect(html).toContain('data-round-marks="opening-kill clutch defused"');
    const ambiguous = render(
      <RoundMarks
        r={round({
          opening: {
            status: "AMBIGUOUS",
            teamWon: null,
            kind: null,
            byMe: true,
            onMe: false,
            tick: 1,
          },
        })}
      />,
    );
    expect(ambiguous).toContain('data-round-marks="none"');
  });

  it("one jump chip per round, unknown outcome dashed", () => {
    const html = render(
      <RoundJump
        rounds={[
          round(),
          round({ roundNumber: 2, won: null }),
          round({ roundNumber: 3, side: null }),
        ]}
      />,
    );
    expect(html.match(/data-jump-round=/g)).toHaveLength(3);
    expect((html.match(/border-dashed/g) ?? []).length).toBe(2);
  });
});

describe("ScoreLine", () => {
  it("known score with result colours; unknown never shows 0 : 0", () => {
    const known = render(<ScoreLine result="win" scorePlayer={13} scoreOpponent={8} />);
    expect(known).toContain('data-scoreline="known"');
    expect(known).toMatch(/>13<.*>8</s);
    const unknown = render(<ScoreLine result={null} scorePlayer={null} scoreOpponent={null} />);
    expect(unknown).toContain('data-scoreline="unknown"');
    expect(unknown).toContain(dictionaries["pt-BR"]["vgl3.score.unknown"]);
    expect(unknown).not.toMatch(/>0</);
  });

  it("new strings exist in the five locales", () => {
    const keys = Object.keys(dictionaries["pt-BR"]).filter((k) => k.startsWith("vgl3."));
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const l of LOCALES)
      for (const k of keys)
        expect(
          dictionaries[l][k as keyof (typeof dictionaries)["pt-BR"]],
          `${l} ${k}`,
        ).toBeTruthy();
  });
});
