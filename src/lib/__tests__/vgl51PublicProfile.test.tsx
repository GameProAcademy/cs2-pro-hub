/** VGL 5.1 — Frente 3: redesigned public profile (render, privacy, five languages). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { buildPlayerDnaV3, asRealPlayerDna } from "@/lib/playerDnaV3";
import type { OverviewMatch } from "@/lib/playerOverview";
import { buildProScore, type ProScore } from "@/lib/proScore";
import { buildPublicProfile, type PublicProfile } from "@/lib/publicProfile/publicProfile";

vi.mock("@tanstack/react-router", async (orig) => {
  const a = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...a,
    Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <a href="#" className={className}>
        {children}
      </a>
    ),
    useNavigate: () => () => undefined,
  };
});

const { PublicProfilePage, flagEmoji } =
  await import("@/components/publicProfile/PublicProfileView");

let n = 0;
const match = (over: Partial<OverviewMatch> = {}) => {
  n += 1;
  return {
    id: `job-${n}-secret`,
    matchId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    fileName: "private-demo.dem",
    map: n % 2 ? "de_mirage" : "de_inferno",
    playedAt: new Date(Date.UTC(2026, 10, 1) + n * 86_400_000).toISOString(),
    result: n % 3 ? "win" : "loss",
    kills: 20,
    deaths: 15,
    assists: 4,
    adr: 86,
    kast: 73,
    hsPercent: 47,
    rating: n % 2 ? 1.35 : 0.95,
    roundsPlayed: 24,
    ...over,
  } as unknown as OverviewMatch;
};

function profile(over: Partial<PublicProfile["identity"]> = {}, matches = 8): PublicProfile {
  const base = buildPublicProfile({
    identity: {
      publicId: "V3JPF-B8ZPF",
      nickname: "zabumba10",
      country: "BR",
      platform: "GAMERS_CLUB",
      role: null,
      team: null,
      avatarUrl: null,
      ...over,
    },
    matches: Array.from({ length: matches }, () => match()),
    score: {
      ...buildProScore([]),
      state: "READY",
      score: 66,
      confidence: "MODERATE",
      matches,
      coverage: 0.9,
    } as ProScore,
    dna: asRealPlayerDna(buildPlayerDnaV3([])),
  });
  return {
    ...base,
    dna: {
      state: "READY",
      matches,
      dimensions: [
        { dimension: "decision_making", value: 87 },
        { dimension: "positioning", value: 71 },
        { dimension: "utility", value: 27 },
        { dimension: "economy", value: null },
      ],
    },
  };
}

function render(p: PublicProfile | "NOT_FOUND", locale: Locale = "pt-BR") {
  const qc = new QueryClient();
  qc.setQueryData(
    ["public-profile", "V3JPF-B8ZPF"],
    p === "NOT_FOUND" ? { state: "NOT_FOUND" } : { state: "OK", profile: p },
  );
  return renderToString(
    <QueryClientProvider client={qc}>
      <I18nProvider initialLocale={locale}>
        <PublicProfilePage publicId="V3JPF-B8ZPF" />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("public profile redesign", () => {
  it("hero: identity, flag + country, platform, specialty, public id; best-map art behind it", () => {
    const html = render(profile());
    expect(html).toContain("data-public-identity");
    expect(html).toContain('data-public-country="BR"');
    expect(html).toContain('data-public-platform="GAMERS_CLUB"');
    expect(html).toContain('data-public-specialty="decision_making"');
    expect(html).toContain("V3JPF-B8ZPF");
    expect(html).toMatch(/data-map-art="(de_)?mirage"/);
    expect(html).toContain(flagEmoji("BR")!);
    expect(html).toContain('data-public-avatar="default"');
  });

  it("score, stat strip, radar (read-only), best map, recent and compare in order", () => {
    const html = render(profile());
    const order = [
      "data-public-score-block",
      "data-public-stats",
      "data-dna-radar-a",
      "data-public-best-map",
      "data-public-recent",
      "data-public-compare-form",
    ].map((m) => html.indexOf(m));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const radar = html.slice(
      html.indexOf("data-dna-radar-a"),
      html.indexOf("</svg>", html.indexOf("data-dna-radar-a")),
    );
    expect(radar).not.toContain('role="button"');
  });

  it("uses the profile's own photo when present, the default symbol otherwise", () => {
    expect(
      render(
        profile({
          avatarUrl: "https://x.supabase.co/storage/v1/object/sign/avatars/a.png?token=t",
        }),
      ),
    ).toContain('data-public-avatar="photo"');
  });

  it("never leaks internal ids, file names or e-mail", () => {
    const html = render(profile());
    expect(html).not.toMatch(/secret|private-demo|00000000-0000-4000|@[a-z]+\.[a-z]/i);
  });

  it("private and unknown ids render the same state", () => {
    const html = render("NOT_FOUND");
    expect(html).toContain("data-public-state");
    expect(html).not.toContain("data-public-identity");
  });

  it.each(["pt-BR", "en", "es", "fr", "pt-PT"] as Locale[])("%s: no missing keys", (locale) => {
    const html = render(profile(), locale);
    expect(html).not.toMatch(/\b(vgl5|vgl51|bestMap|real|dna)\.[a-zA-Z]+\.[A-Za-z_.]+/);
  });
});
