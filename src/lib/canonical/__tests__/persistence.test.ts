/**
 * FASE 2.6.5 — persistence contract of the Canonical Match Engine.
 *
 * These tests cover the SERIALISATION boundary: what the database routine
 * receives. They never touch the network or the database.
 */
import { describe, expect, it } from "vitest";

import { ME, syntheticParserOutput } from "@/lib/pipeline/__tests__/fixture";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";

import { demoToCanonicalBundle } from "../adapters/demo.adapter";
import {
  CanonicalPersistenceError,
  canonicalBundleToRpcPayload,
} from "../canonical.persistence.server";
import { CANONICAL_SCHEMA_VERSION } from "../canonical.versions";
import type { CanonicalMatchBundle } from "../canonical.types";

function demoBundle(): CanonicalMatchBundle {
  return demoToCanonicalBundle({
    parsed: normalizeParserOutput(syntheticParserOutput),
    fingerprint: "b".repeat(64),
    targetSteamId: ME,
    internalPlayerId: "player-1",
    fetchedAt: "2026-01-02T03:04:05.000Z",
  });
}

type Payload = {
  observation: Record<string, unknown>;
  match: Record<string, unknown>;
  series: unknown;
  participants: Array<Record<string, unknown>>;
  rounds: Array<Record<string, unknown>>;
  roundPlayers: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
};

describe("canonical persistence payload", () => {
  it("keeps every canonical layer, so nothing is dropped on the way to the database", () => {
    const payload = canonicalBundleToRpcPayload(demoBundle()) as Payload;
    expect(Object.keys(payload).sort()).toEqual([
      "events",
      "match",
      "observation",
      "participants",
      "roundPlayers",
      "rounds",
      "series",
    ]);
    expect(payload.rounds.length).toBeGreaterThan(0);
    expect(payload.participants.length).toBeGreaterThan(0);
  });

  it("carries the demo fingerprint as the idempotency key", () => {
    const payload = canonicalBundleToRpcPayload(demoBundle()) as Payload;
    expect(payload.observation["fingerprint"]).toBe("b".repeat(64));
    expect(payload.observation["externalMatchId"]).toBeNull();
  });

  it("declares the canonical schema version the routine accepts", () => {
    const payload = canonicalBundleToRpcPayload(demoBundle()) as Payload;
    expect(payload.match["schemaVersion"]).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it("refuses a bundle from another canonical schema version", () => {
    const bundle = demoBundle();
    const stale = { ...bundle, match: { ...bundle.match, schemaVersion: 1 } };
    expect(() => canonicalBundleToRpcPayload(stale)).toThrow(CanonicalPersistenceError);
  });

  it("preserves NULL instead of turning it into zero", () => {
    const bundle = demoBundle();
    const payload = canonicalBundleToRpcPayload({
      ...bundle,
      match: { ...bundle.match, scoreTeamA: null, scoreTeamB: null, roundCount: null },
    }) as Payload;
    expect(payload.match["scoreTeamA"]).toBeNull();
    expect(payload.match["roundCount"]).toBeNull();
  });

  it("never carries a player-relative field on the match", () => {
    const payload = canonicalBundleToRpcPayload(demoBundle()) as Payload;
    for (const forbidden of ["playerId", "player_id", "uploadId", "scorePlayer", "teamPlayer"]) {
      expect(payload.match[forbidden]).toBeUndefined();
    }
  });

  it("keeps a demo free of any invented series", () => {
    const payload = canonicalBundleToRpcPayload(demoBundle()) as Payload;
    expect(payload.series).toBeNull();
  });
});
