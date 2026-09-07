import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { syntheticParserOutput, ME } from "@/lib/pipeline/__tests__/fixture";
import { demoToCanonicalBundle } from "@/lib/canonical/adapters/demo.adapter";
const b = demoToCanonicalBundle({ parsed: normalizeParserOutput(syntheticParserOutput), fingerprint: "c".repeat(64), targetSteamId: ME, internalPlayerId: null, fetchedAt: "2026-03-01T21:00:00.000Z" });
console.log(JSON.stringify({map:b.match.map,playedAt:b.match.playedAt,scoreA:b.match.scoreTeamA,scoreB:b.match.scoreTeamB,participants:b.participants.map(p=>p.steamId64),rounds:b.rounds.length,events:b.events.length}));
