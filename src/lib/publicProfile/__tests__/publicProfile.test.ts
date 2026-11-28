/** VGL 5.0 — public profile: id format, whitelist, privacy and anti-enumeration guards. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildPlayerDnaV3, asRealPlayerDna } from "@/lib/playerDnaV3";
import type { OverviewMatch } from "@/lib/playerOverview";
import { buildProScore, type ProScore } from "@/lib/proScore";
import {
  COMPARE_MIN_MATCHES,
  PUBLIC_ID_RE,
  buildPublicProfile,
  comparePublicProfiles,
  normalizePublicId,
  type PublicProfile,
} from "@/lib/publicProfile/publicProfile";

const read = (p: string) => readFileSync(p, "utf8");

let day = 0;
function match(over: Partial<OverviewMatch> = {}): OverviewMatch {
  day += 1;
  return {
    id: `job-${day}-secret`,
    matchId: `00000000-0000-4000-8000-${String(day).padStart(12, "0")}`,
    uploadId: "upload-secret",
    fileName: "private-demo-file.dem",
    map: "de_mirage",
    playedAt: new Date(Date.UTC(2026, 10, 1) + day * 86_400_000).toISOString(),
    result: "win",
    kills: 22,
    deaths: 16,
    assists: 4,
    adr: 88,
    kast: 74,
    hsPercent: 48,
    rating: 1.18,
    roundsPlayed: 24,
    ...over,
  } as unknown as OverviewMatch;
}

const identity = {
  publicId: "ABCDE-FGHJK",
  nickname: "  Player\u0000One  ",
  country: "BR",
  platform: "FACEIT",
  role: "Entry",
  team: null,
  avatarUrl: null,
};
const emptyDna = asRealPlayerDna(buildPlayerDnaV3([]));
const readyScore = (value: number, matches = 6): ProScore =>
  ({
    ...buildProScore([]),
    state: "READY",
    score: value,
    confidence: "MODERATE",
    matches,
    coverage: 1,
  }) as ProScore;

function profile(matches: OverviewMatch[], score: ProScore = buildProScore([])): PublicProfile {
  return buildPublicProfile({ identity, matches, score, dna: emptyDna });
}

describe("public id", () => {
  it("normalizes case, spacing and the dash; rejects ambiguous symbols and other shapes", () => {
    expect(normalizePublicId(" abcde fghjk ")).toBe("ABCDE-FGHJK");
    expect(normalizePublicId("abcdefghjk")).toBe("ABCDE-FGHJK");
    for (const bad of [
      "ABCDE-FGHJ",
      "ABCDE-FGHJI",
      "0BCDE-FGHJK",
      "1BCDE-FGHJK",
      "OBCDE-FGHJK",
      "../admin",
      "",
      null,
      42,
      "ABCDE-FGHJK-2",
    ])
      expect(normalizePublicId(bad)).toBeNull();
  });

  it("the client regex and the database CHECK are the same alphabet", () => {
    const sql = read("supabase/migrations/20261128120000_vgl5_public_profile.sql");
    expect(sql).toContain("CHECK (public_id ~ '^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$')");
    expect(sql).toContain("'23456789ABCDEFGHJKLMNPQRSTUVWXYZ'");
    expect(PUBLIC_ID_RE.source).toBe("^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$");
  });
});

describe("buildPublicProfile — whitelist", () => {
  it("never carries internal ids, file names or upload ids; sanitizes identity text", () => {
    const p = profile(Array.from({ length: 4 }, () => match()));
    const json = JSON.stringify(p);
    expect(json).not.toMatch(
      /secret|private-demo-file|upload|00000000-0000-4000|@|user_?id|email/i,
    );
    expect(p.identity.nickname).toBe("Player One");
    expect(Object.keys(p.recent[0]!).sort()).toEqual(
      ["adr", "deaths", "kills", "map", "playedAt", "rating", "result"].sort(),
    );
    expect(p.recent.length).toBeLessThanOrEqual(5);
  });

  it("missing data stays null, never zero", () => {
    const p = profile([]);
    expect(p.stats.adr).toBeNull();
    expect(p.stats.winRate).toBeNull();
    expect(p.score.value).toBeNull();
    expect(p.maps.best).toBeNull();
    expect(p.dna.dimensions.every((d) => d.value === null)).toBe(true);
  });

  it("a non-READY Score is never published as a number", () => {
    const p = profile([match()], { ...readyScore(70), state: "INSUFFICIENT_SAMPLE" } as ProScore);
    expect(p.score.value).toBeNull();
    expect(p.score.confidence).toBeNull();
  });
});

describe("comparePublicProfiles", () => {
  const strong = profile(
    Array.from({ length: 6 }, () => match({ adr: 95, rating: 1.3 })),
    readyScore(72),
  );
  const weak = profile(
    Array.from({ length: 6 }, () => match({ adr: 70, rating: 0.95, result: "loss" })),
    readyScore(51),
  );

  it("same definitions on both sides; leader per metric; HS% never ranked", () => {
    const rows = Object.fromEntries(comparePublicProfiles(strong, weak).map((r) => [r.key, r]));
    expect(rows["score"]!.verdict).toBe("A");
    expect(rows["adr"]!.verdict).toBe("A");
    expect(rows["winRate"]!.verdict).toBe("A");
    expect(rows["hsPercent"]!.verdict).toBe("NOT_COMPARABLE");
    expect(comparePublicProfiles(weak, strong).find((r) => r.key === "rating")!.verdict).toBe("B");
  });

  it("small gaps are EVEN; thin samples or a missing side are NOT_COMPARABLE", () => {
    expect(comparePublicProfiles(strong, strong).find((r) => r.key === "adr")!.verdict).toBe(
      "EVEN",
    );
    const thin = profile(
      Array.from({ length: COMPARE_MIN_MATCHES - 1 }, () => match({ adr: 140 })),
    );
    expect(comparePublicProfiles(thin, weak).every((r) => r.verdict === "NOT_COMPARABLE")).toBe(
      true,
    );
    const noScore = profile(Array.from({ length: 6 }, () => match()));
    expect(comparePublicProfiles(noScore, strong).find((r) => r.key === "score")!.verdict).toBe(
      "NOT_COMPARABLE",
    );
  });
});

describe("server boundary (source guards)", () => {
  const fn = read("src/lib/publicProfile.functions.ts");
  const publicFn = fn.slice(
    fn.indexOf("export const getPublicProfile"),
    fn.indexOf("export interface PublicProfileSettings"),
  );

  it("public read selects only whitelisted columns and requires public_profile = true", () => {
    const select = /\.select\("([^"]+)"\)\s*\.eq\("public_id"/.exec(publicFn)?.[1] ?? "";
    expect(select.split(/,\s*/).sort()).toEqual(
      [
        "country",
        "main_platform",
        "nickname",
        "public_id",
        "public_profile",
        "role",
        "team",
        "user_id",
      ].sort(),
    );
    expect(publicFn).toContain('.eq("public_profile", true)');
    expect(publicFn).not.toMatch(/email|faceit_|steam_id|gamersclub_|coach_/);
    expect(fn).not.toMatch(/from\("profiles"\)\.select\("[^"]*email/);
  });

  it("private and unknown ids get the same answer (no enumeration oracle)", () => {
    expect(publicFn.match(/state: "NOT_FOUND"/g)?.length).toBe(1);
    expect(publicFn).toContain('if (error || !player) return { state: "NOT_FOUND" };');
    expect(publicFn).not.toMatch(/PRIVATE|FORBIDDEN/);
  });

  it("service role only inside the handler; owner endpoints keep the session", () => {
    expect(fn).not.toMatch(/^import .*client\.server/m);
    expect(fn.slice(fn.indexOf("getMyPublicProfileSettings"))).toContain(
      ".middleware([requireSupabaseAuth])",
    );
    expect(fn.slice(fn.indexOf("setMyPublicProfile"))).toContain('.eq("user_id", context.userId)');
  });

  it("migration: private by default, unique id, id immutable and forced private on client insert", () => {
    const sql = read("supabase/migrations/20261128120000_vgl5_public_profile.sql");
    expect(sql).toContain("public_profile boolean NOT NULL DEFAULT false");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_public_id_key");
    expect(sql).toContain("RAISE EXCEPTION 'PUBLIC_ID_IMMUTABLE'");
    expect(sql).toContain("NEW.public_profile := false;");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.new_player_public_id() FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).not.toMatch(/CREATE POLICY|TO anon/);
  });

  it("the profile page offers the switch and the public route needs no session", () => {
    expect(read("src/routes/_authenticated/profile.tsx")).toContain("<PublicProfileCard />");
    const route = read("src/routes/p/$publicId.tsx");
    expect(route).toContain('createFileRoute("/p/$publicId")');
    expect(route).toContain('content: "noindex"');
  });
});
