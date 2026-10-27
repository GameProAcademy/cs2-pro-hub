import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * D31 (2026-10-27): `match_rounds.player_side` and its sibling player-scoped columns are
 * LEGACY. They were written from the uploading player's perspective by the pre-canonical
 * demo persistence (removed in 6f75024a, 2026-09-08). Since FASE 2.6.2 a canonical match is
 * shared by every user who attaches to it, so one per-match column cannot hold one player's
 * side; the per-player, per-round side lives in `round_players.side`.
 *
 * These tests keep that decision explicit: no application code may start writing or reading
 * the legacy columns as if they were authoritative, the canonical writer must keep leaving
 * them out, and evidence reports must check `round_players.side`, not `match_rounds.player_side`.
 * See docs/MATCH_ROUNDS_LEGACY_PLAYER_COLUMNS.md.
 */
const LEGACY = [
  "player_side",
  "player_money_start",
  "player_money_end",
  "player_equipment_value",
  "player_survived",
] as const;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : walk(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("legacy player-scoped match_rounds columns", () => {
  it("no application module reads or writes them (generated types excepted)", () => {
    const offenders = walk(resolve("src"))
      .filter((path) => !path.endsWith(join("integrations", "supabase", "types.ts")))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return LEGACY.filter((column) => source.includes(column)).map((c) => `${path}: ${c}`);
      });
    expect(offenders).toEqual([]);
  });

  it("the latest canonical round writer leaves them out", () => {
    const dir = resolve("supabase/migrations");
    const writers = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) =>
        readFileSync(join(dir, name), "utf8").includes("INSERT INTO public.match_rounds"),
      );
    expect(writers.length).toBeGreaterThan(0);
    const latest = readFileSync(join(dir, writers[writers.length - 1]), "utf8");
    const start = latest.lastIndexOf("INSERT INTO public.match_rounds");
    const columns = latest.slice(start, latest.indexOf(")", start));
    for (const column of LEGACY) expect(columns).not.toContain(column);
    expect(columns).toContain("winner_side");
  });

  it("the per-player per-round side has its own home in round_players", () => {
    const types = readFileSync(resolve("src/integrations/supabase/types.ts"), "utf8");
    const roundPlayers = types.slice(
      types.indexOf("round_players: {"),
      types.indexOf("Insert:", types.indexOf("round_players: {")),
    );
    expect(roundPlayers).toContain("side: string | null");
    expect(roundPlayers).toContain("participant_key: string");
  });

  it("the closure report does not treat match_rounds.player_side as evidence", () => {
    const report = readFileSync(resolve("docs/CS2_PRO_RELEASE_CLOSURE_REPORT.md"), "utf8");
    const rows = report
      .split("\n")
      .filter((line) => line.startsWith("|") && line.includes("player_side"));
    for (const row of rows) expect(row).toMatch(/legacy|LEGACY/);
  });
});
