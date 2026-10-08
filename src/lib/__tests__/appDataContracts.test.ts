import { describe, expect, it } from "vitest";
import {
  appDataState,
  appPlayerSchema,
  appRouteIdentitySchema,
  appUploadSchema,
  appDemoIdentitySchema,
  appParserReadinessSchema,
  futureCoachContextSchema,
  futureMetricEvidenceSchema,
} from "../appDataContracts";
import { getCoachHistoryState, getPlayerDnaState } from "../../services/playerService";

describe("app contracts are non-authorizing", () => {
  it.each(["LOADING", "EMPTY", "NOT_AVAILABLE", "BLOCKED"] as const)(
    "%s does not synthesize data",
    (status) => {
      expect(appDataState(status, null, appPlayerSchema)).toEqual({ status, data: null });
    },
  );
  it.each([null, undefined, {}, { id: "bad", name: null }])(
    "rejects malformed/missing players",
    (input) => {
      expect(appDataState("READY", input, appPlayerSchema).status).toBe("ERROR");
    },
  );
  it("accepts a valid resource without inventing values", () => {
    const data = { id: "00000000-0000-4000-8000-000000000001", name: "Player" };
    expect(appDataState("READY", data, appPlayerSchema)).toEqual({ status: "READY", data });
  });
  it("rejects malformed routes and missing DEM identity", () => {
    expect(appRouteIdentitySchema.safeParse({ playerId: "wrong" }).success).toBe(false);
    expect(appRouteIdentitySchema.safeParse({ unexpected: true }).success).toBe(false);
    expect(appUploadSchema.safeParse(null).success).toBe(false);
    expect(appDemoIdentitySchema.safeParse({}).success).toBe(false);
  });
  it("keeps DNA and Coach DEMO_ONLY", () => {
    expect(getPlayerDnaState().status).toBe("DEMO_ONLY");
    expect(getCoachHistoryState().status).toBe("DEMO_ONLY");
  });
  it("rejects authority claims and missing future evidence", () => {
    expect(
      appParserReadinessSchema.safeParse({ status: "READY", canonicalAuthorization: true }).success,
    ).toBe(false);
    expect(
      futureCoachContextSchema.safeParse({
        status: "BLOCKED",
        canonicalAuthorization: false,
        metrics: [],
        assertions: [{ kind: "OBSERVED", evidenceRefs: [] }],
      }).success,
    ).toBe(false);
    expect(
      futureMetricEvidenceSchema.safeParse({ value: 0, status: "NOT_AVAILABLE" }).success,
    ).toBe(false);
  });
});
