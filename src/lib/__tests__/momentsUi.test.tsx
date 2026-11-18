/**
 * PM5 / 4.2.10 — moments library page (static render, every locale): empty, filtered with no
 * match, list with replay deep links on the moment's own match/round/tick, unavailable moments
 * without a replay link, private notice, and the strict server inputs.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/config";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, search }: { children: ReactNode; search?: Record<string, unknown> }) => (
      <a data-search={search ? JSON.stringify(search) : undefined}>{children}</a>
    ),
  };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { MomentsBody } = await import("@/components/moments/RealMoments");
const { createMomentInput, listMomentsInput, updateMomentInput } =
  await import("@/lib/moments.functions");
type Moment = import("@/lib/moments.functions").Moment;

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const MATCH = "55555555-5555-4555-8555-555555555555";
const moment = (o: Partial<Moment> = {}): Moment => ({
  id: "66666666-6666-4666-8666-666666666666",
  matchId: MATCH,
  map: "de_nuke",
  roundNumber: 7,
  tickStart: 4321,
  tickEnd: 4900,
  eventRef: null,
  kind: "KILL",
  title: "Entry A",
  note: "check the crosshair",
  tags: ["entry"],
  source: "REPLAY",
  collections: [],
  availability: "AVAILABLE",
  createdAt: "2026-11-18T01:00:00Z",
  updatedAt: "2026-11-18T01:00:00Z",
  ...o,
});
const page = (moments: Moment[]) => [
  {
    moments,
    nextCursor: null,
    collections: [
      {
        id: "c1",
        name: "Review",
        description: "",
        archived: false,
        count: 1,
        createdAt: "2026-11-18T00:00:00Z",
      },
    ],
    tags: ["entry"],
  },
];
const body = (moments: Moment[], search = {}, locale: Locale = "pt-BR") =>
  render(
    <MomentsBody
      pages={page(moments)}
      search={search}
      onSearch={() => {}}
      hasMore={false}
      loadingMore={false}
      onMore={() => {}}
    />,
    locale,
  );

describe("moments page", () => {
  it.each(LOCALES)("empty and filtered-empty states in %s", (loc) => {
    const empty = body([], {}, loc);
    expect(empty).toContain('data-moments-status="EMPTY"');
    expect(empty).toContain(esc(dictionaries[loc]["moments.empty.description"]));
    expect(empty).toContain(esc(dictionaries[loc]["moments.privacy"]));
    expect(body([], { kind: "DEATH" }, loc)).toContain('data-moments-status="NO_MATCH"');
  });

  it("a moment opens the replay on its own match, round and first tick", () => {
    const html = body([moment()]);
    expect(html).toContain('data-moments-status="OK"');
    const links = [...html.matchAll(/data-search="([^"]+)"/g)].map((m) =>
      JSON.parse(m[1]!.replace(/&quot;/g, '"')),
    );
    expect(links).toEqual([{ matchId: MATCH, round: 7, tick: 4321 }]);
    expect(html).toMatch(/#(<!-- -->)?entry/);
  });

  it("a moment whose match was removed is UNAVAILABLE, without a replay link", () => {
    const html = body([moment({ matchId: null, availability: "UNAVAILABLE" })]);
    expect(html).toContain('data-availability="UNAVAILABLE"');
    expect(html).toContain("data-moment-unavailable");
    expect(html).not.toContain("data-search=");
  });
});

describe("server inputs are strict", () => {
  it("create needs an own-match uuid, a round, a known kind and source; no owner field", () => {
    const ok = {
      matchId: MATCH,
      round: 1,
      tickStart: 10,
      kind: "KILL",
      title: "t",
      source: "REPLAY",
    };
    expect(createMomentInput.parse(ok)).toMatchObject(ok);
    expect(() => createMomentInput.parse({ ...ok, userId: "x" })).toThrow();
    expect(() => createMomentInput.parse({ ...ok, kind: "SCREENSHOT" })).toThrow();
    expect(() => createMomentInput.parse({ ...ok, title: "" })).toThrow();
    expect(() => createMomentInput.parse({ ...ok, matchId: "1 or 1=1" })).toThrow();
  });
  it("list limits are bounded; update cannot change the match", () => {
    expect(() => listMomentsInput.parse({ limit: 500 })).toThrow();
    expect(() => updateMomentInput.parse({ id: MATCH, matchId: MATCH })).toThrow();
  });
});
