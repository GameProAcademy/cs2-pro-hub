/**
 * Canonical v3 harness — server path (2026-10-28).
 *
 * Runs the EXACT server code path that production uses after the worker answers
 * (normalizeParserOutput → validateCanonicalMatch → demoToCanonicalBundle →
 * applyServerPolicyV3 → validateCanonicalBundle) on parser contract outputs, and writes the bundle so
 * scripts/canonical_v3/harness.py can measure every one of the 105 fields.
 *
 * - Without CANONICAL_V3_HARNESS_INPUTS it runs on a small committed fixture
 *   (shape check only; never evidence about a real demo).
 * - With it (comma-separated `label=path` pairs of real parser outputs produced
 *   locally from the owner's DEMs) it writes one bundle per input into
 *   CANONICAL_V3_HARNESS_OUT. The inputs are never committed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { demoToCanonicalBundle } from "@/lib/canonical/adapters/demo.adapter";
import { applyServerPolicyV3 } from "@/lib/canonical/canonicalContractV3";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserOutput } from "@/lib/pipeline/types";
import { validateCanonicalBundle, validateCanonicalMatch } from "@/lib/pipeline/validator";

const FIXED_FETCHED_AT = "2026-10-28T00:00:00.000Z";

export function serverBundle(
  raw: RawParserOutput,
  opts: { fingerprint: string; target: string | null },
) {
  const match = normalizeParserOutput(raw);
  validateCanonicalMatch(match);
  const { bundle } = applyServerPolicyV3(
    demoToCanonicalBundle({
      parsed: match,
      fingerprint: opts.fingerprint,
      targetParticipantKey: opts.target,
      // The harness never resolves ownership; a placeholder id exercises the identity branch.
      internalPlayerId: opts.target ? "00000000-0000-4000-8000-000000000001" : null,
      fetchedAt: FIXED_FETCHED_AT,
    }),
  );
  validateCanonicalBundle(bundle.match, bundle.rounds, bundle.events);
  return bundle;
}

const FIXTURE: RawParserOutput = {
  contract_version: 1,
  parser: { name: "demoparser2", version: "0.42.0", revision: "git:fixture" },
  header: {
    map: "de_fixture",
    match_date: null,
    duration_seconds: null,
    tickrate: null,
    teams: {},
    score: {},
  },
  players: [
    { steam_id: "76561198000000001", name: "A", side: "CT" },
    { steam_id: "76561198000000002", name: "B", side: "T" },
  ],
  rounds: Array.from({ length: 13 }, (_, i) => ({
    number: i + 1,
    start_tick: 100 + i * 1000,
    end_tick: 600 + i * 1000,
    winner_side: "CT",
    bomb_planted: false,
    bomb_defused: false,
    bomb_exploded: false,
    sides: { "76561198000000001": "CT", "76561198000000002": "T" },
    money_start: { "76561198000000001": 800, "76561198000000002": 800 },
    money_end: { "76561198000000001": 3250, "76561198000000002": 0 },
    equipment_value: { "76561198000000001": 200, "76561198000000002": 200 },
  })),
  events: [
    {
      type: "player_death",
      round: 1,
      tick: 300,
      time_seconds: 4.7,
      attacker_steamid: "76561198000000001",
      victim_steamid: "76561198000000002",
      weapon: "usp_silencer",
      headshot: true,
    },
  ],
  warnings: [],
} as unknown as RawParserOutput;

describe("canonical v3 harness (server path)", () => {
  it("produces a bundle on the committed fixture with zero kept as zero", () => {
    const bundle = serverBundle(FIXTURE, {
      fingerprint: "f".repeat(64),
      target: "76561198000000001",
    });
    const b = bundle.roundPlayers.find((row) => row.participantKey === "76561198000000002");
    expect(b?.moneyEnd).toBe(0);
    expect(bundle.observation.fetchedAt).toBe(FIXED_FETCHED_AT);
    expect(bundle.participants.find((p) => p.isTargetPlayer)?.identityStatus).toBe("correlated");
  });

  const inputs = process.env["CANONICAL_V3_HARNESS_INPUTS"];
  it.skipIf(!inputs)("writes one bundle per real parser output", () => {
    const out = process.env["CANONICAL_V3_HARNESS_OUT"] ?? "canonical-v3-harness-out";
    mkdirSync(out, { recursive: true });
    for (const pair of (inputs ?? "").split(",").filter(Boolean)) {
      const [label, path, fingerprint, target] = pair.split("=");
      const raw = JSON.parse(readFileSync(path!, "utf8")) as {
        out?: RawParserOutput;
      } & RawParserOutput;
      const contract = (raw.out ?? raw) as RawParserOutput;
      const bundle = serverBundle(
        {
          ...contract,
          contract_version: contract.contract_version ?? 1,
          parser: contract.parser ?? { name: "demoparser2", version: "0.42.0" },
        } as RawParserOutput,
        { fingerprint: fingerprint!, target: target || null },
      );
      writeFileSync(join(out, `${label}.bundle.json`), JSON.stringify(bundle));
    }
  });
});
