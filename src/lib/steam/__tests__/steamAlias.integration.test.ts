/**
 * STEAM — nickname-alias migration against a disposable PostgreSQL
 * (scripts/steam/steam_alias_harness.py). Mutation: dropping the verified-identity guard
 * must be caught (an alias would then be written for an unproven Steam account).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Result = { database: string; checks: Record<string, boolean>; failures: string[] };
const MIGRATION = "supabase/migrations/20261119010000_steam_nickname_aliases.sql";

function run(migration?: string): Result {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "", HOME: "/tmp" };
  if (migration) env["STEAM_ALIAS_MIGRATION"] = migration;
  const output = execFileSync("python3", ["scripts/steam/steam_alias_harness.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 240_000,
    env,
  });
  return JSON.parse(output.trim()) as Result;
}

describe("Steam nickname aliases (SQL)", () => {
  it("records aliases only for the verified owner, idempotently, without downgrades", () => {
    const result = run();
    expect(result.database).toBe("disposable-local-postgresql");
    expect(result.failures).toEqual([]);
    for (const name of [
      "migration_applies",
      "migration_reapplies",
      "old_sources_still_accepted",
      "verified_alias_inserted",
      "alias_shape",
      "repeat_is_idempotent",
      "nfkc_normalised",
      "stronger_row_kept",
      "unverified_player_refused",
      "wrong_steam_id_refused",
      "other_players_steam_refused",
      "history_never_deleted",
      "authenticated_cannot_call",
      "anon_cannot_call",
      "authenticated_cannot_insert",
      "owner_reads_own_aliases",
      "other_player_sees_nothing",
      "definer_search_path_empty",
    ])
      expect(result.checks[name], name).toBe(true);
  }, 240_000);

  it("detects a function that skips the verified-identity guard", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-alias-mut-"));
    const mutated = join(dir, "mutated.sql");
    const sql = readFileSync(MIGRATION, "utf8").replace(
      "       AND is_verified = true\n       AND identity_status = 'verified'::public.identity_link_status\n",
      "",
    );
    expect(sql).not.toContain("AND is_verified = true");
    writeFileSync(mutated, sql);
    expect(run(mutated).failures).toContain("unverified_player_refused");
  }, 240_000);
});
