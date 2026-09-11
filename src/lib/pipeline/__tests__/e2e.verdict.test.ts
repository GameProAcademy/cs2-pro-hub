/**
 * GATE 02-B — verdict rules. Pure logic, so the gate criteria themselves are
 * proven: an unhealthy worker is BLOCKED (never PASS), an invalid demo must fail
 * permanently AND write nothing, a valid demo must produce a complete canonical
 * + projection footprint, and reprocessing must not multiply rows.
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_EVIDENCE,
  evaluateE2ERun,
  evaluateIdempotency,
  hasNoCanonicalWrite,
  type E2EEvidence,
  type E2EJobState,
} from "../e2e";

const job = (overrides: Partial<E2EJobState> = {}): E2EJobState => ({
  status: "processed",
  errorCode: null,
  matchId: "11111111-1111-1111-1111-111111111111",
  roundsValid: 24,
  playersDetected: 10,
  parserName: "demoparser2",
  parserVersion: "0.42.0",
  parserRevision: "git:790eaed77eb8cbed8efaa98e1a4f5f0ac33a8bdd",
  ...overrides,
});

const fullEvidence: E2EEvidence = {
  matchIds: ["11111111-1111-1111-1111-111111111111"],
  matchSourceCount: 1,
  participants: 10,
  rounds: 24,
  roundPlayers: 240,
  events: 1800,
  metrics: 1,
  features: 1,
};

describe("evaluateE2ERun", () => {
  it("BLOCKS when the parser worker preflight fails", () => {
    const result = evaluateE2ERun({
      expectation: "positive",
      workerReady: false,
      workerError: "PARSER_IDENTITY_MISMATCH",
      job: job(),
      evidence: fullEvidence,
    });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("PARSER_IDENTITY_MISMATCH");
  });

  it("BLOCKS when the job never reached a terminal state", () => {
    expect(
      evaluateE2ERun({
        expectation: "positive",
        workerReady: true,
        workerError: null,
        job: job({ status: "processing" }),
        evidence: EMPTY_EVIDENCE,
      }).verdict,
    ).toBe("BLOCKED");
  });

  it("PASSES the positive scenario only with a complete footprint", () => {
    expect(
      evaluateE2ERun({
        expectation: "positive",
        workerReady: true,
        workerError: null,
        job: job(),
        evidence: fullEvidence,
      }),
    ).toEqual({ verdict: "PASS", reasons: [] });
  });

  it("FAILS the positive scenario when the projection is missing", () => {
    const result = evaluateE2ERun({
      expectation: "positive",
      workerReady: true,
      workerError: null,
      job: job(),
      evidence: { ...fullEvidence, metrics: 0, features: 0 },
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons).toHaveLength(2);
  });

  it("FAILS the positive scenario when two canonical matches exist", () => {
    const result = evaluateE2ERun({
      expectation: "positive",
      workerReady: true,
      workerError: null,
      job: job(),
      evidence: { ...fullEvidence, matchIds: ["a", "b"] },
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons.join(" ")).toContain("exactly 1 canonical match");
  });

  it("FAILS the positive scenario when the job failed", () => {
    const result = evaluateE2ERun({
      expectation: "positive",
      workerReady: true,
      workerError: null,
      job: job({ status: "failed", errorCode: "CORRUPTED_DEMO" }),
      evidence: EMPTY_EVIDENCE,
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons.join(" ")).toContain("CORRUPTED_DEMO");
  });

  it("PASSES the negative scenario on a permanent failure with no writes", () => {
    expect(
      evaluateE2ERun({
        expectation: "negative",
        workerReady: true,
        workerError: null,
        job: job({ status: "failed", errorCode: "CORRUPTED_DEMO", matchId: null }),
        evidence: EMPTY_EVIDENCE,
      }),
    ).toEqual({ verdict: "PASS", reasons: [] });
  });

  it("FAILS the negative scenario when the error is transient", () => {
    const result = evaluateE2ERun({
      expectation: "negative",
      workerReady: true,
      workerError: null,
      job: job({ status: "failed", errorCode: "PARSER_TIMEOUT", matchId: null }),
      evidence: EMPTY_EVIDENCE,
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons.join(" ")).toContain("permanent");
  });

  it("FAILS the negative scenario when any canonical row was written", () => {
    const result = evaluateE2ERun({
      expectation: "negative",
      workerReady: true,
      workerError: null,
      job: job({ status: "failed", errorCode: "CORRUPTED_DEMO", matchId: null }),
      evidence: { ...EMPTY_EVIDENCE, matchSourceCount: 1 },
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons.join(" ")).toContain("must not write");
  });
});

describe("evaluateIdempotency", () => {
  it("PASSES when reprocessing changes nothing", () => {
    expect(evaluateIdempotency(fullEvidence, { ...fullEvidence })).toEqual({
      verdict: "PASS",
      reasons: [],
    });
  });

  it("FAILS when rows were duplicated", () => {
    const result = evaluateIdempotency(fullEvidence, { ...fullEvidence, events: 3600 });
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons.join(" ")).toContain("events changed from 1800 to 3600");
  });

  it("FAILS when a second canonical match appeared", () => {
    const result = evaluateIdempotency(fullEvidence, {
      ...fullEvidence,
      matchIds: [...fullEvidence.matchIds, "22222222-2222-2222-2222-222222222222"],
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons.join(" ")).toContain("different canonical match");
  });
});

describe("hasNoCanonicalWrite", () => {
  it("is true only for a completely empty footprint", () => {
    expect(hasNoCanonicalWrite(EMPTY_EVIDENCE)).toBe(true);
    expect(hasNoCanonicalWrite({ ...EMPTY_EVIDENCE, features: 1 })).toBe(false);
  });
});
