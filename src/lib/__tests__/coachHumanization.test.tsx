/**
 * Fase 4.0.1 B — AI Coach humanization: name resolution (never an e-mail or id), server-side
 * control of when the name is used, trainer voice without chatbot filler, the "Coach's
 * Response" label and identity in 5 locales — with every data rule and guard unchanged.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { buildCoachFacts, buildCoachMessages, coachSystemPrompt } from "@/lib/coach/coachContext";
import {
  enforceNameUse,
  resolveCoachName,
  sanitizeCoachName,
  shouldUseName,
  stripChatbotPhrases,
} from "@/lib/coach/coachPersona";
import { guardCoachReply } from "@/lib/coach/coachReplyGuard";
import { preferencesFrom } from "@/lib/coachSession.functions";
import type { RealPlayerDna } from "@/lib/playerDna";
import { aggregate, type OverviewMatch, type PlayerOverview } from "@/lib/playerOverview";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { PreferencesForm } = await import("@/components/coach/CoachControls");

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];

describe("name resolution", () => {
  it("never uses an e-mail, its local part, a UUID, a Steam id or a link", () => {
    expect(sanitizeCoachName("thiago1010@msn.com")).toBeNull();
    expect(sanitizeCoachName("thiago1010", "thiago1010@msn.com")).toBeNull();
    expect(sanitizeCoachName("Thiago1010", "thiago1010@msn.com")).toBeNull();
    expect(sanitizeCoachName("4f0c2a8e-1d2b-4c3d-9e8f-0a1b2c3d4e5f")).toBeNull();
    expect(sanitizeCoachName("76561198000000001")).toBeNull();
    expect(sanitizeCoachName("https://evil.example")).toBeNull();
    expect(sanitizeCoachName("1234")).toBeNull();
    expect(sanitizeCoachName("   ")).toBeNull();
    expect(sanitizeCoachName("x".repeat(33))).toBeNull();
    expect(sanitizeCoachName(42)).toBeNull();
  });

  it("keeps real names and nicknames, cleaned of markup and extra spaces", () => {
    expect(sanitizeCoachName("  João   Pedro ")).toBe("João Pedro");
    expect(sanitizeCoachName("**Zoë**")).toBe("Zoë");
    expect(sanitizeCoachName("s1mple")).toBe("s1mple");
    expect(sanitizeCoachName("lojacriativa", "outro@live.com")).toBe("lojacriativa");
    expect(sanitizeCoachName("Ana\u0000​")).toBe("Ana");
  });

  it("order: preferred → player nickname → account nickname → display name → none", () => {
    const base = {
      preferred: "Thi",
      playerNickname: "ThiCS",
      accountNickname: "Tico",
      displayName: "Thiago Silva",
      email: "thiago1010@msn.com",
    };
    expect(resolveCoachName(base)).toEqual({ name: "Thi", source: "PREFERRED" });
    expect(resolveCoachName({ ...base, preferred: null })).toEqual({
      name: "ThiCS",
      source: "PLAYER_NICKNAME",
    });
    expect(resolveCoachName({ ...base, preferred: null, playerNickname: "" })).toEqual({
      name: "Tico",
      source: "ACCOUNT_NICKNAME",
    });
    expect(
      resolveCoachName({ ...base, preferred: null, playerNickname: null, accountNickname: null }),
    ).toEqual({ name: "Thiago Silva", source: "DISPLAY_NAME" });
    // Display name that is the e-mail (a common signup default) → neutral fallback.
    expect(
      resolveCoachName({
        email: "thiago1010@msn.com",
        displayName: "thiago1010@msn.com",
        accountNickname: "thiago1010",
      }),
    ).toEqual({ name: null, source: null });
  });
});

describe("when the name is used", () => {
  it("first reply of a conversation, then every 4th — never every message", () => {
    expect([0, 1, 2, 3, 4, 5, 8].map(shouldUseName)).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      true,
    ]);
  });

  it("removes a leading vocative when the name is not allowed in this reply", () => {
    const off = { name: "Thiago", useName: false };
    expect(enforceNameUse("Thiago, seu ADR caiu.", off)).toEqual({
      text: "Seu ADR caiu.",
      removed: 1,
    });
    expect(enforceNameUse("Oi, Thiago! seu ADR caiu.", off).text).toBe("Seu ADR caiu.");
    expect(enforceNameUse("**Thiago**, foco no trade.", off).text).toBe("Foco no trade.");
    expect(enforceNameUse("Seu ADR caiu, Thiago.", off).removed).toBe(0);
    expect(enforceNameUse("Thiago, seu ADR caiu.", { name: "Thiago", useName: true }).removed).toBe(
      0,
    );
    expect(enforceNameUse("Thiago, x", { name: null, useName: false }).removed).toBe(0);
  });
});

describe("trainer voice: chatbot filler is removed, substance stays", () => {
  const cases: Record<Locale, [string, string]> = {
    "pt-BR": [
      "Ótima pergunta! Seu foco agora é o trade.\n\nEspero ter ajudado! Se precisar de mais alguma coisa, é só chamar.",
      "Seu foco agora é o trade.",
    ],
    "pt-PT": [
      "Excelente pergunta. O teu foco agora é o trade.\nEspero ter ajudado.",
      "O teu foco agora é o trade.",
    ],
    en: [
      "Great question! As an AI, I can only read your data. Focus on trading.\nI hope this helps! Feel free to ask more.",
      "Focus on trading.",
    ],
    es: [
      "¡Excelente pregunta! Céntrate en el trade.\nEspero que esto te ayude.",
      "Céntrate en el trade.",
    ],
    fr: [
      "Excellente question ! Concentre-toi sur le trade.\nJ’espère que cela t’aide.",
      "Concentre-toi sur le trade.",
    ],
  };
  it.each(LOCALES)("%s", (locale) => {
    const [input, expected] = cases[locale];
    const out = stripChatbotPhrases(input, locale);
    expect(out.text).toBe(expected);
    expect(out.removed).toBeGreaterThan(0);
  });

  it("headings, tables and normal sentences are untouched", () => {
    const text =
      "## Dados\n| Mapa | ADR |\n|---|---|\n| Nuke | 117.6 |\n\nTreine o trade por 15 minutos.";
    expect(stripChatbotPhrases(text, "pt-BR")).toEqual({ text, removed: 0 });
  });
});

describe("prompt, messages and guard", () => {
  const match = {
    matchId: "nuke",
    map: "de_nuke",
    playedAt: "2026-11-03T05:35:03Z",
    dateSource: "processed",
    resultStatus: "UNRESOLVED_BY_DEMO",
    result: null,
    scorePlayer: null,
    scoreOpponent: null,
    source: "demo",
    kills: 18,
    deaths: 10,
    assists: 4,
    adr: 117.6,
    kast: 84.2,
    hsPercent: 27.8,
    rating: 1.13,
    firstKills: 3,
    firstDeaths: 0,
    tradeKills: 3,
    flashAssists: 0,
    utilityDamage: 38,
    clutchAttempts: 1,
    clutchWins: 1,
    ctRating: 0.78,
    tRating: 1.72,
    roundsPlayed: 19,
    admission: "LIMITED",
    limitations: [],
  } as unknown as OverviewMatch;
  const facts = buildCoachFacts(
    {
      state: "READY",
      generatedAt: "2026-11-04T00:00:00Z",
      counts: {
        total: 0,
        inFlight: 0,
        processed: 0,
        failed: 0,
        blocked: 0,
        cancelled: 0,
        identityPending: 0,
      },
      latestJobs: [],
      matches: [match],
      aggregates: aggregate([match]),
    } as PlayerOverview,
    {
      state: "INSUFFICIENT_SAMPLE",
      matches: 1,
      rounds: 19,
      partialMatches: 0,
      minimumMatches: 3,
      dimensions: [],
    } as RealPlayerDna,
    "pt-BR",
  );

  it("the system prompt carries the trainer voice and the addressing rule; data rules stay", () => {
    const p = coachSystemPrompt("pt-BR");
    expect(p).toContain("you are the player's CS2 trainer, not a generic assistant");
    expect(p).toContain("PLAYER_ADDRESS.useName is true you may use the name ONCE");
    expect(p).toContain("Never use an e-mail");
    expect(p).toContain("A null value means NOT MEASURED, never zero");
    expect(p).toContain("never compare the player with them");
  });

  it("PLAYER_ADDRESS is separate from PLAYER_FACTS and carries only name + useName", () => {
    const [system] = buildCoachMessages(facts, [], "oi", "pt-BR", {
      name: "Thiago",
      source: "PREFERRED",
      useName: true,
    });
    expect(system!.content).toContain('PLAYER_ADDRESS = {"name":"Thiago","useName":true}');
    expect(system!.content.split("PLAYER_ADDRESS")[0]).not.toContain("Thiago");
    const [none] = buildCoachMessages(facts, [], "oi", "pt-BR");
    expect(none!.content).toContain('PLAYER_ADDRESS = {"name":null,"useName":false}');
    const [noName] = buildCoachMessages(facts, [], "oi", "pt-BR", {
      name: null,
      source: null,
      useName: true,
    });
    expect(noName!.content).toContain('"useName":false');
  });

  it("a name with digits is not taken for an unbacked statistic", () => {
    const reply = "Dados\nBob 99, seu ADR foi 117.6 na Nuke.";
    expect(guardCoachReply(reply, facts, "pt-BR", { playerName: "Bob 99" }).text).toContain(
      "Bob 99, seu ADR foi 117.6",
    );
    // Without the name, the same invented 99 is still removed (guard unchanged).
    expect(guardCoachReply(reply, facts, "pt-BR").removed.stats).toBe(1);
  });
});

describe("label, identity and preferences UI", () => {
  const labels: Record<Locale, string> = {
    "pt-BR": "Resposta do Treinador",
    "pt-PT": "Resposta do Treinador",
    en: "Coach's Response",
    es: "Respuesta del Entrenador",
    fr: "Réponse de l’entraîneur",
  };
  it.each(LOCALES)("%s: label and persona texts", (locale) => {
    const d = dictionaries[locale] as Record<string, string>;
    expect(d["real.aicoach.aiLabel"]).toBe(labels[locale]);
    for (const k of [
      "coach2.persona.identity",
      "coach2.persona.greeting",
      "coach2.persona.greetingNamed",
      "coach2.persona.intro",
      "coach2.prefs.name",
      "coach2.prefs.nameHint",
      "coach2.prefs.nameInvalid",
    ])
      expect(d[k], `${locale} ${k}`).toBeTruthy();
    expect(d["coach2.persona.greetingNamed"]).toContain("{name}");
    expect(d["coach2.persona.intro"]).not.toMatch(/\bIA\b|\bAI\b|\bassistant/i);
  });

  const render = (initial: Parameters<typeof PreferencesForm>[0]["initial"]) =>
    renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider initialLocale="pt-BR">
          <PreferencesForm initial={initial} onClose={() => {}} onSaved={() => {}} />
        </I18nProvider>
      </QueryClientProvider>,
    );

  it("the name field appears only when the column exists, prefilled, max 32", () => {
    const html = render({
      available: true,
      saved: true,
      mainDifficulty: null,
      maps: [],
      preferredName: "Thiago",
      nameAvailable: true,
    });
    expect(html).toContain("Como prefere ser chamado");
    expect(html).toContain('value="Thiago"');
    expect(html).toContain('maxLength="32"');
    expect(render({ available: true, saved: false, mainDifficulty: null, maps: [] })).not.toContain(
      "Como prefere ser chamado",
    );
  });

  it("server validation: absent keeps, empty clears, unsafe rejects", () => {
    expect(preferencesFrom({ maps: [] })).toEqual({ ok: true, mainDifficulty: null, maps: [] });
    expect(preferencesFrom({ maps: [], preferredName: "" })).toMatchObject({
      ok: true,
      preferredName: null,
    });
    expect(preferencesFrom({ maps: [], preferredName: " Zoë " })).toMatchObject({
      preferredName: "Zoë",
    });
    for (const bad of ["a@b.com", "76561198000000001", "https://x.y", 7, "x".repeat(80)])
      expect(preferencesFrom({ maps: [], preferredName: bad })).toEqual({ ok: false });
  });
});

describe("server wiring", () => {
  const src = read("src/lib/coach.functions.ts");
  it("the e-mail is read only to exclude it; the address object never carries it", () => {
    expect(src).toContain('.select("nickname, display_name, email")');
    expect(src).toMatch(/return \{ name, source, useName \};/);
    expect(src).not.toMatch(/PLAYER_ADDRESS[^\n]*email/);
  });
  it("the reply passes guard → filler removal → name control; provenance logs only the source", () => {
    const g = src.indexOf("guardCoachReply(sanitized.text.trim()");
    const p = src.indexOf("stripChatbotPhrases(guarded.text.trim()");
    const n = src.indexOf("enforceNameUse(persona.text, address)");
    expect(g).toBeGreaterThan(0);
    expect(p).toBeGreaterThan(g);
    expect(n).toBeGreaterThan(p);
    expect(src).toContain("playerName: address.name");
    expect(src).toContain('|name=${address.source ?? "none"}');
    expect(src).toContain(
      "buildCoachMessages(facts, history, input.message, input.locale, address)",
    );
  });
  it("provider and model are unchanged (OpenRouter only, no fallback added)", () => {
    const provider = read("src/lib/coach/coachProvider.server.ts");
    expect(provider).toContain("openai/gpt-oss-20b");
  });
});
