/**
 * STEAM — what the link writes must be accepted by the PRODUCTION constraints.
 *
 * Regression: the mapper wrote `profile_locator_type = 'steam_id_64'`, which
 * `player_connections_locator_type_chk` / `player_identities_locator_type_chk` reject
 * (only `numeric_id` | `slug`), so every real Steam link failed at `steam_link_commit`
 * with STEAM_INTERNAL_ERROR. Unit tests mocked the database and never saw it. This test
 * reads the allowed values from the migrations themselves.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mapSteamConnectionFields,
  mapSteamIdentityFields,
  steamMinimalProfile,
} from "@/lib/steam/steam.mapper";

const DIR = "supabase/migrations";

function allowedLocatorTypes(constraint: string): string[] {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let allowed: string[] | null = null;
  for (const file of files) {
    const sql = readFileSync(join(DIR, file), "utf8");
    const re = new RegExp(`${constraint}\\s+CHECK\\s*\\(([\\s\\S]*?)\\);`, "g");
    for (const m of sql.matchAll(re))
      allowed = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
  }
  if (!allowed) throw new Error(`constraint ${constraint} not found`);
  return allowed;
}

describe("Steam link payload vs database constraints", () => {
  const profile = steamMinimalProfile("76561198000000001");

  it("connection locator type is allowed by player_connections_locator_type_chk", () => {
    const allowed = allowedLocatorTypes("player_connections_locator_type_chk");
    expect(allowed).toEqual(expect.arrayContaining(["numeric_id", "slug"]));
    expect(allowed).toContain(mapSteamConnectionFields(profile, "v").profile_locator_type);
  });

  it("identity locator type is allowed by player_identities_locator_type_chk", () => {
    const allowed = allowedLocatorTypes("player_identities_locator_type_chk");
    expect(allowed).toContain(mapSteamIdentityFields(profile).profile_locator_type);
  });

  it("profile URLs satisfy the https constraint", () => {
    expect(mapSteamConnectionFields(profile, "v").profile_url).toMatch(/^https:\/\//i);
  });
});
