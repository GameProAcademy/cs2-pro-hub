import { describe, expect, it } from "vitest";
import {
  evaluateH3E91R41Authority,
  H3E91_R41_CURRENT_PROOFS,
  H3E91_R41_REQUIRED_PROOFS,
  type H3E91R41Proofs,
  type H3E91R41ProofStatus,
} from "@/lib/h3e91R41Authority.server";

const evidence = (status: H3E91R41ProofStatus): H3E91R41Proofs =>
  Object.fromEntries(H3E91_R41_REQUIRED_PROOFS.map((proof) => [proof, status])) as H3E91R41Proofs;

describe("H3E91 R4.1 independent authority contract", () => {
  it("the current checkpoint remains blocked without independently collected evidence", () => {
    const decision = evaluateH3E91R41Authority(H3E91_R41_CURRENT_PROOFS);
    expect(decision.status).toBe("BLOCKED");
    expect(decision.blockers).toEqual(H3E91_R41_REQUIRED_PROOFS);
    expect(decision.realDemAuthorized).toBe(false);
    expect(decision.canonicalAuthorized).toBe(false);
  });

  it.each(["UNKNOWN", "BLOCKED", "FAIL"] as const)(
    "each missing %s proof independently blocks authority",
    (missing) => {
      for (const proof of H3E91_R41_REQUIRED_PROOFS) {
        const decision = evaluateH3E91R41Authority({ ...evidence("PASS"), [proof]: missing });
        expect(decision).toMatchObject({ status: "BLOCKED", blockers: [proof] });
      }
    },
  );

  it("all PASS is only an audit-readiness decision, not an operational permission", () => {
    expect(evaluateH3E91R41Authority(evidence("PASS"))).toEqual({
      status: "READY_FOR_INDEPENDENT_EXTERNAL_AUDIT",
      blockers: [],
      realDemAuthorized: false,
      canonicalAuthorized: false,
    });
  });
});