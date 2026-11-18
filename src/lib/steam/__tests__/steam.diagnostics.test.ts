/**
 * STEAM — failed callbacks record stage + internal code only (no identifiers, no protocol
 * values), and the public callback route records every failure path.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { SteamError } from "@/lib/steam/steam.errors";

const inserts: Array<Record<string, unknown>> = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return { error: null };
      },
    }),
  },
}));

const { recordSteamLinkFailure } = await import("@/lib/steam/steam.diagnostics.server");

describe("steam link failure diagnostics", () => {
  it("stores stage, code and upstream status only", async () => {
    await recordSteamLinkFailure(
      "validate",
      new SteamError("STEAM_TEMPORARY_ERROR", { status: 503 }),
    );
    await recordSteamLinkFailure("link", new Error("76561198120154806 secret"));
    expect(inserts).toEqual([
      {
        table: "steam_link_failures",
        stage: "validate",
        error_code: "STEAM_TEMPORARY_ERROR",
        http_status: 503,
      },
      {
        table: "steam_link_failures",
        stage: "link",
        error_code: expect.stringMatching(/^STEAM_[A-Z_]+$/),
        http_status: null,
      },
    ]);
    expect(JSON.stringify(inserts)).not.toContain("7656119");
  });

  it("is wired into every failure of the public callback", () => {
    const route = readFileSync("src/routes/api/public/integrations/steam/callback.ts", "utf8");
    expect(route).toContain("recordSteamLinkFailure(stage, steamError)");
    for (const stage of ['stage = "throttle"', 'stage = "validate"', 'stage = "link"'])
      expect(route).toContain(stage);
  });
});
