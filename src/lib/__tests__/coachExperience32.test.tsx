/**
 * Fase 3.2 — AI Coach experience: conversations (list, resume, delete), optional declared
 * preferences, readable titles, suggested questions, five locales, and isolation of every
 * new read/write to the caller's own player.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { coach2PtBR } from "@/i18n/locales/coach2/pt-BR";
import { conversationTitle } from "@/lib/coach.functions";
import {
  COACH_DIFFICULTY_CODES,
  COACH_MAP_CODES,
  conversationIdFrom,
  preferencesFrom,
} from "@/lib/coachSession.functions";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { PreferencesForm, SuggestedQuestions } = await import("@/components/coach/CoachControls");

const read = (p: string) => readFileSync(resolve(p), "utf8");
const src32 = () => read("src/lib/coachSession.functions.ts");
const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: React.ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );

describe("conversation titles", () => {
  it("one line, cut at a word, never longer than 61 chars", () => {
    expect(conversationTitle("  Como   melhorar\nna Mirage? ")).toBe("Como melhorar na Mirage?");
    const long =
      "Qual deve ser meu foco de treino nesta semana considerando minhas últimas partidas na Ancient";
    const t = conversationTitle(long);
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith("…")).toBe(true);
    expect(long.startsWith(t.slice(0, -1))).toBe(true);
    expect(t.slice(0, -1).endsWith(" ")).toBe(false);
    expect(conversationTitle("x".repeat(100))).toBe(`${"x".repeat(60)}…`);
  });
});

describe("input validation of the new server functions", () => {
  it("conversation ids must be UUIDs", () => {
    expect(conversationIdFrom({ conversationId: "8f1c2d3e-0000-4000-8000-000000000001" })).toBe(
      "8f1c2d3e-0000-4000-8000-000000000001",
    );
    expect(conversationIdFrom({ conversationId: "x' or 1=1" })).toBeNull();
    expect(conversationIdFrom(null)).toBeNull();
  });

  it("preferences accept only catalogued codes; maps are deduplicated and sorted", () => {
    expect(
      preferencesFrom({ mainDifficulty: "AIM", maps: ["de_nuke", "de_ancient", "de_nuke"] }),
    ).toEqual({
      ok: true,
      mainDifficulty: "AIM",
      maps: ["de_ancient", "de_nuke"],
    });
    expect(preferencesFrom({ mainDifficulty: null, maps: [] })).toEqual({
      ok: true,
      mainDifficulty: null,
      maps: [],
    });
    expect(preferencesFrom({ mainDifficulty: "HACKS", maps: [] })).toEqual({ ok: false });
    expect(preferencesFrom({ mainDifficulty: "AIM", maps: ["de_nuke'; drop table"] })).toEqual({
      ok: false,
    });
    expect(preferencesFrom({ maps: "de_nuke" })).toEqual({ ok: false });
    expect(preferencesFrom({ maps: Array(13).fill("de_nuke") })).toEqual({ ok: false });
  });

  it("the codes in code equal the CHECK constraints of the migration", () => {
    const sql = read("supabase/migrations/20261104150000_coach_preferences.sql");
    const difficulty = sql.match(/main_difficulty IN \(([^)]*)\)/)![1]!;
    expect([...difficulty.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])).toEqual([
      ...COACH_DIFFICULTY_CODES,
    ]);
    const maps = sql.match(/maps <@ ARRAY\[([^\]]*)\]/)![1]!;
    expect([...maps.matchAll(/'(de_[a-z0-9]+)'/g)].map((m) => m[1])).toEqual([...COACH_MAP_CODES]);
  });
});

describe("persistence, privacy and isolation", () => {
  const src = read("src/lib/coachSession.functions.ts");

  it("every new server function is authenticated and resolves the player from the session", () => {
    const fns = [...src.matchAll(/export const (\w+) = createServerFn/g)].map((m) => m[1]);
    expect(fns).toEqual([
      "listCoachConversations",
      "getCoachConversation",
      "deleteCoachConversation",
      "getCoachPreferences",
      "saveCoachPreferences",
      "deleteCoachPreferences",
    ]);
    expect((src.match(/\.middleware\(\[requireSupabaseAuth\]\)/g) ?? []).length).toBe(6);
    expect(src).toContain('ownPlayerIds(db, userId, "COACH")');
    expect(src).not.toMatch(/supabaseAdmin|service_role|client\.server/);
    expect(src).not.toMatch(/data\.(playerId|userId|player_id|user_id)/);
  });

  it("every read and write is narrowed to the caller's player (and RLS backs it)", () => {
    expect(src).toMatch(
      /from\("coach_conversations"\)\s*\.select\("id, title, updated_at"\)\s*\.eq\("player_id", playerId\)/,
    );
    // A conversation's messages are read only after proving it belongs to the caller.
    const proof = src.search(
      /\.eq\("id", data\.conversationId\)\s*\.eq\("player_id", playerId\)\s*\.maybeSingle\(\)/,
    );
    const messagesRead = src.indexOf('.eq("conversation_id", data.conversationId)');
    expect(proof).toBeGreaterThan(0);
    expect(proof).toBeLessThan(messagesRead);
    expect(src).toMatch(
      /\.delete\(\)\s*\.eq\("id", data\.conversationId\)\s*\.eq\("player_id", playerId\)/,
    );
    expect(src).toMatch(/upsert\(\s*\{\s*player_id: playerId,/);
    expect(src).toMatch(
      /from\("coach_preferences"\)\s*\.delete\(\)\s*\.eq\("player_id", playerId\)/,
    );
    const sql = read("supabase/migrations/20261104150000_coach_preferences.sql");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(
      /USING \(public\.owns_player\(player_id\)\)\s*WITH CHECK \(public\.owns_player\(player_id\)\)/,
    );
    expect(sql).toContain("REVOKE ALL ON public.coach_preferences FROM anon, authenticated;");
    expect(sql).toContain("ON DELETE CASCADE");
  });

  it("declared preferences reach the Coach as DECLARED, and their failure never drops the profile", () => {
    const coach = read("src/lib/coach.functions.ts");
    expect(coach).toContain("mainDifficulty: preferences.mainDifficulty");
    expect(coach).toContain("mapsOfInterest: preferences.maps");
    expect(coach).toMatch(/loadCoachPreferences\(db, playerId\)\.catch\(/);
  });
});

describe("the chat UI uses real server functions only", () => {
  const ui = read("src/components/coach/RealCoachChat.tsx");
  const controls = read("src/components/coach/CoachControls.tsx");

  it("list, resume, new conversation, delete and personalize are wired", () => {
    expect(ui).toContain("<ConversationMenu");
    expect(ui).toContain("getCoachConversation({ data: { conversationId: picked } })");
    expect(ui).toContain("<DeleteConversationButton");
    expect(ui).toContain("<PreferencesPanel");
    expect(ui).toContain("<SuggestedQuestions");
    expect(controls).toContain("deleteCoachConversation({ data: { conversationId } })");
    expect(controls).toContain("saveCoachPreferences({");
    expect(controls).toContain("deleteCoachPreferences()");
    expect(ui).not.toMatch(/placeholderReply|getCoachHistory|setTimeout/);
  });

  it("the onboarding is optional and dismissible; storage failures never break the chat", () => {
    expect(ui).toContain("prefs.data?.saved === false");
    expect(ui).toMatch(/try \{\s*return globalThis\.localStorage\?\.getItem/);
    expect(ui).toMatch(/try \{\s*globalThis\.localStorage\?\.setItem/);
  });

  it("the preferences form renders every code and states that it is declared, not measured", () => {
    const html = render(
      <PreferencesForm
        initial={{ available: true, saved: false, mainDifficulty: null, maps: [] }}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    for (const code of COACH_DIFFICULTY_CODES) expect(html).toContain(`value="${code}"`);
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(COACH_MAP_CODES.length);
    expect(html).toContain("não uma medição");
    expect(html).not.toContain("Apagar preferências");
    const saved = render(
      <PreferencesForm
        initial={{ available: true, saved: true, mainDifficulty: "AIM", maps: ["de_nuke"] }}
        onClose={() => {}}
        onSaved={() => {}}
      />,
      "en",
    );
    expect(saved).toContain("Delete preferences");
    expect(saved).toMatch(/aria-pressed="true"[^>]*>Nuke</);
  });

  it("suggested questions exist in the 5 locales", () => {
    for (const locale of LOCALES) {
      const html = render(<SuggestedQuestions onPick={() => {}} />, locale);
      expect((html.match(/<button/g) ?? []).length).toBe(4);
    }
  });
});

describe("i18n", () => {
  it("every Fase 3 key exists in the 5 locales with the same placeholders", () => {
    for (const locale of LOCALES) {
      const dict = dictionaries[locale] as Record<string, string>;
      for (const [key, pt] of Object.entries(coach2PtBR)) {
        expect(dict[key]?.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
        const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
        expect(vars(dict[key]!), `${locale}:${key}`).toEqual(vars(pt));
      }
    }
  });
});
