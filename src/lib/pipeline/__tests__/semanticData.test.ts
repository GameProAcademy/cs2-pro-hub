import { describe, expect, it } from "vitest";

import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { selectPlayerSemanticData } from "@/lib/pipeline/semanticData";

import { ENEMY_A, ME, syntheticParserOutput } from "./fixture";

function semanticMatch() {
  const match = normalizeParserOutput({
    ...syntheticParserOutput,
    hot_semantic_data: {
      schema_version: 1,
      aim_observations: [{ player: ME, tick: 1, yaw: 10 }, { player: ENEMY_A, tick: 2, yaw: 20 }],
      position_snapshots: [{ player: ME, tick: 1, x: 1 }, { player: ENEMY_A, tick: 2, x: 2 }],
      economy_snapshots: [{ player: ME, round: 1, balance: 800 }, { player: ENEMY_A, round: 1, balance: 1200 }],
      quality: {
        aim_observations: { status: "complete", observed_rows: 2, included_rows: 2, limit: 4096, overflow_rows: 0 },
        position_snapshots: { status: "limited", observed_rows: 3, included_rows: 2, limit: 4096, overflow_rows: 1 },
        economy_snapshots: { status: "complete", observed_rows: 2, included_rows: 2, limit: 4096, overflow_rows: 0 },
      },
    },
  });
  match.players = match.players.map((player) =>
    player.steamId === ME ? { ...player, participantKey: "participant-local" } : player,
  );
  return match;
}

describe("player semantic data", () => {
  it("isolates AIM, position, economy and utility for the selected participant", () => {
    const scoped = selectPlayerSemanticData(semanticMatch(), "participant-local");
    expect(scoped.eventPlayerKey).toBe(ME);
    expect(scoped.aim).toHaveLength(1);
    expect(scoped.position).toHaveLength(1);
    expect(scoped.economy).toHaveLength(1);
    expect(scoped.utility.every((event) => event.actorSteamId === ME)).toBe(true);
    expect(scoped.availability).toMatchObject({ aim: "complete", position: "limited", economy: "complete", utility: "available" });
  });

  it("reports unavailable sections without inventing zero-valued evidence", () => {
    const scoped = selectPlayerSemanticData(normalizeParserOutput(syntheticParserOutput), ME);
    expect(scoped.aim).toEqual([]);
    expect(scoped.position).toEqual([]);
    expect(scoped.economy).toEqual([]);
    expect(scoped.availability.aim).toBe("unavailable");
  });

  it("keeps utility scoped to the selected participant while preserving coverage", () => {
    const scoped = selectPlayerSemanticData(semanticMatch(), ENEMY_A);
    expect(scoped.utility).toEqual([]);
    expect(scoped.availability.utility).toBe("available");
  });

  it("supports a canonical participant without Steam when source keys correlate the evidence", () => {
    const withoutSteam = semanticMatch();
    withoutSteam.players = withoutSteam.players.map((player) =>
      player.steamId === ME ? { ...player, participantKey: "participant-local", steamId: null } : player,
    );
    withoutSteam.hotSemanticData = {
      ...withoutSteam.hotSemanticData!,
      aim_observations: [{ player: "participant-local", tick: 1, yaw: 10 }],
      position_snapshots: [{ player: "participant-local", tick: 1, x: 1 }],
      economy_snapshots: [{ player: "participant-local", round: 1, balance: 800 }],
    };
    const scoped = selectPlayerSemanticData(withoutSteam, "participant-local");
    expect(scoped.eventPlayerKey).toBe("participant-local");
    expect(scoped.aim).toHaveLength(1);
    expect(scoped.position).toHaveLength(1);
    expect(scoped.economy).toHaveLength(1);
  });
});