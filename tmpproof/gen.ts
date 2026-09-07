import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { syntheticParserOutput, ME } from "@/lib/pipeline/__tests__/fixture";
import { demoToCanonicalBundle } from "@/lib/canonical/adapters/demo.adapter";
import { faceitToCanonicalObservation } from "@/lib/canonical/adapters/faceit.adapter";
import { writeFileSync } from "node:fs";

const STEAM = Array.from({length:10},(_,i)=>`765611980000001${String(i+10)}`);
const PLAYED = "2026-03-01T20:00:00.000Z";

const demo = demoToCanonicalBundle({
  parsed: normalizeParserOutput(syntheticParserOutput),
  fingerprint: "c".repeat(64), targetSteamId: ME, internalPlayerId: null,
  fetchedAt: "2026-03-01T21:00:00.000Z",
});
// FIXTURE ROSTER: ten test accounts on both sides, so the proof exercises the
// full-roster rule. These are fixture accounts, not fabricated real identities.
const demoBundle = {
  ...demo,
  match: { ...demo.match, map: "de_mirage", playedAt: PLAYED, startedAt: PLAYED, finishedAt: null, scoreTeamA: 13, scoreTeamB: 9 },
  participants: STEAM.map((s, i) => ({
    participantKey: s, internalPlayerId: null, source: "demo", externalPlayerId: null,
    steamId64: s, nicknameSnapshot: `fixture${i+1}`, team: i < 5 ? "team_a" : "team_b",
    isTargetPlayer: i === 0, identityStatus: "correlated", identityConfidence: null, metadata: {},
  })),
};

function faceit(matchId: string, roster: string[], scoreA = 13, scoreB = 9) {
  const out = faceitToCanonicalObservation({
    mapped: {
      external_match_id: matchId, platform: "faceit", map: "de_mirage", match_date: PLAYED,
      score_player: scoreA, score_opponent: scoreB, result: "win", rounds: scoreA + scoreB,
      finished: true, terminal: true, team_player: "team_alpha", team_opponent: "team_beta",
      duration_seconds: 2400, source_fetched_at: "2026-03-01T21:05:00.000Z",
      source_version: "faceit-v1", metadata: { is_series: false, best_of: 1 },
    } as never,
    targetTeamSlot: "team_a",
    participants: roster.map((s, i) => ({
      externalPlayerId: `faceit-${i+1}`, nickname: `fixture${i+1}`, steamId64: s,
      team: i < 5 ? "team_a" : "team_b", isTargetPlayer: i === 0, internalPlayerId: null,
    })),
  });
  return out.bundles[0];
}

writeFileSync("tmpproof/demo.json", JSON.stringify(demoBundle));
writeFileSync("tmpproof/faceit-same.json", JSON.stringify(faceit("1-proof-same", STEAM)));
writeFileSync("tmpproof/faceit-other.json", JSON.stringify(faceit("1-proof-other", [...STEAM.slice(0,7), "76561198000009991","76561198000009992","76561198000009993"], 16, 7)));
console.log("ok");
