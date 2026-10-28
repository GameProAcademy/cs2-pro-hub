/**
 * canonical-demo-v3 — server-path persistence policy (2026-10-28).
 *
 * The contract (scripts/canonical_v3/contract.py, docs/CANONICAL_DEMO_V3.md) gives each of the
 * 105 Canonical fields one state per path. On the server path, 34 fields are NOT available:
 * they are legitimately empty for a DEM, unsupported by the current extraction, or not
 * authorized because their single source of truth is the metrics layer. Their persisted value
 * is fixed (the "representation"). This module enforces that before persistence:
 *
 * - a field that already carries its representation is untouched (the normal case);
 * - a field that carries anything else is WITHHELD — replaced by its representation — and the
 *   withholding is recorded in the observation metadata (`canonical_v3_withheld`), never silent.
 *
 * The observation is tagged with the contract (`canonical_contract`) so a stored bundle can be
 * told apart from a v2 one (v2 observations carry no such key). Nothing here changes a value of an
 * available field. scripts/tests/test_canonical_v3_contract.py pins this list to the contract.
 */
import type { CanonicalMatchBundle } from "@/lib/canonical/canonical.types";

export const CANONICAL_CONTRACT_V3 = "canonical-demo-v3" as const;
/** sha256 of docs/client-parser/canonical-demo-v3/contract.json (pinned by test_canonical_v3_contract.py). */
export const CANONICAL_CONTRACT_V3_DIGEST = "f4c053022c75ca528c5c9bfb95f197e2ff031082224652ad1cd8ca128757b858";

type Entity = "observation" | "match" | "participants" | "rounds" | "roundPlayers";
type Representation = null | "unknown" | Record<string, never>;

export const SERVER_FIXED_FIELDS_V3: ReadonlyArray<{
  id: string;
  entity: Entity;
  path: readonly string[];
  representation: Representation;
}> = [
  {
    id: "CanonicalMatchSource.externalMatchId",
    entity: "observation",
    path: ["externalMatchId"],
    representation: null,
  },
  {
    id: "CanonicalMatchSource.externalParentId",
    entity: "observation",
    path: ["externalParentId"],
    representation: null,
  },
  {
    id: "CanonicalMatchSource.sourceUpdatedAt",
    entity: "observation",
    path: ["sourceUpdatedAt"],
    representation: null,
  },
  { id: "CanonicalMatch.mapNumber", entity: "match", path: ["mapNumber"], representation: null },
  { id: "CanonicalMatch.playedAt", entity: "match", path: ["playedAt"], representation: null },
  { id: "CanonicalMatch.startedAt", entity: "match", path: ["startedAt"], representation: null },
  { id: "CanonicalMatch.finishedAt", entity: "match", path: ["finishedAt"], representation: null },
  {
    id: "CanonicalMatch.durationSeconds",
    entity: "match",
    path: ["durationSeconds"],
    representation: null,
  },
  { id: "CanonicalMatch.teamA", entity: "match", path: ["teamA"], representation: null },
  { id: "CanonicalMatch.teamB", entity: "match", path: ["teamB"], representation: null },
  { id: "CanonicalMatch.scoreTeamA", entity: "match", path: ["scoreTeamA"], representation: null },
  { id: "CanonicalMatch.scoreTeamB", entity: "match", path: ["scoreTeamB"], representation: null },
  { id: "CanonicalMatch.winnerTeam", entity: "match", path: ["winnerTeam"], representation: null },
  {
    id: "CanonicalMatch.coverage.participantsExpected",
    entity: "match",
    path: ["coverage", "participantsExpected"],
    representation: null,
  },
  { id: "CanonicalParticipant.team", entity: "participants", path: ["team"], representation: null },
  {
    id: "CanonicalParticipant.metadata",
    entity: "participants",
    path: ["metadata"],
    representation: {},
  },
  {
    id: "CanonicalRound.startTimeSeconds",
    entity: "rounds",
    path: ["startTimeSeconds"],
    representation: null,
  },
  {
    id: "CanonicalRound.endTimeSeconds",
    entity: "rounds",
    path: ["endTimeSeconds"],
    representation: null,
  },
  {
    id: "CanonicalRound.durationSeconds",
    entity: "rounds",
    path: ["durationSeconds"],
    representation: null,
  },
  {
    id: "CanonicalRound.winningTeam",
    entity: "rounds",
    path: ["winningTeam"],
    representation: null,
  },
  {
    id: "CanonicalRound.winReason",
    entity: "rounds",
    path: ["winReason"],
    representation: "unknown",
  },
  { id: "CanonicalRound.metadata", entity: "rounds", path: ["metadata"], representation: {} },
  {
    id: "CanonicalRoundPlayer.survived",
    entity: "roundPlayers",
    path: ["survived"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.buyContext",
    entity: "roundPlayers",
    path: ["buyContext"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.kills",
    entity: "roundPlayers",
    path: ["kills"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.deaths",
    entity: "roundPlayers",
    path: ["deaths"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.assists",
    entity: "roundPlayers",
    path: ["assists"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.damage",
    entity: "roundPlayers",
    path: ["damage"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.flashAssists",
    entity: "roundPlayers",
    path: ["flashAssists"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.openingKill",
    entity: "roundPlayers",
    path: ["openingKill"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.openingDeath",
    entity: "roundPlayers",
    path: ["openingDeath"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.traded",
    entity: "roundPlayers",
    path: ["traded"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.tradeKill",
    entity: "roundPlayers",
    path: ["tradeKill"],
    representation: null,
  },
  {
    id: "CanonicalRoundPlayer.metadata",
    entity: "roundPlayers",
    path: ["metadata"],
    representation: {},
  },
];

function isRepresentation(value: unknown, representation: Representation): boolean {
  if (representation === null) return value === null;
  if (typeof representation === "string") return value === representation;
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  );
}

function rowsOf(bundle: CanonicalMatchBundle, entity: Entity): Record<string, unknown>[] {
  const target = bundle[entity] as unknown;
  return (Array.isArray(target) ? target : [target]) as Record<string, unknown>[];
}

/**
 * Returns a copy of the bundle under the v3 server policy, plus the ids of withheld fields
 * (with the count of rows each one was withheld from). The input bundle is not mutated.
 */
export function applyServerPolicyV3(bundle: CanonicalMatchBundle): {
  bundle: CanonicalMatchBundle;
  withheld: Record<string, number>;
} {
  const copy = structuredClone(bundle);
  const withheld: Record<string, number> = {};
  for (const field of SERVER_FIXED_FIELDS_V3) {
    for (const row of rowsOf(copy, field.entity)) {
      let holder: Record<string, unknown> | null = row;
      for (const key of field.path.slice(0, -1)) {
        const next: unknown = holder?.[key];
        holder = next && typeof next === "object" ? (next as Record<string, unknown>) : null;
      }
      const leaf = field.path[field.path.length - 1]!;
      if (!holder || !(leaf in holder)) continue;
      if (isRepresentation(holder[leaf], field.representation)) continue;
      holder[leaf] = field.representation === null ? null : structuredClone(field.representation);
      withheld[field.id] = (withheld[field.id] ?? 0) + 1;
    }
  }
  const metadata: Record<string, unknown> = {
    ...(copy.observation.metadata ?? {}),
    canonical_contract: CANONICAL_CONTRACT_V3,
    canonical_contract_digest: CANONICAL_CONTRACT_V3_DIGEST,
  };
  if (Object.keys(withheld).length > 0) metadata["canonical_v3_withheld"] = withheld;
  copy.observation = { ...copy.observation, metadata };
  return { bundle: copy, withheld };
}
