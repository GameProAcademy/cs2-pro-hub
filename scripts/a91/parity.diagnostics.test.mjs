import { describe, expect, it } from "vitest";
import { diagnoseRuntimeCalls } from "./parity.mjs";

const event = (
  eventName,
  count,
  fullDigest,
  returnedFields = ["tick", "userid"],
) => ({
  eventName,
  count,
  fullDigest,
  returnedFields,
});
const call = (api, count, outputDigest, extra = {}) => ({
  api,
  status: "SUCCEEDED",
  count,
  outputDigest,
  ...extra,
});

describe("A9.1 sanitized semantic diagnostics", () => {
  it("identifies the first event divergence without publishing rows", () => {
    const python = {
      eventEvidence: [event("round_start", 1, "a"), event("player_death", 2, "b")],
      apiCalls: [
        call("parseEvent", 1, "a", { eventName: "round_start" }),
        call("parseEvent", 2, "b", { eventName: "player_death" }),
        call("parseGrenades", 4, "g"),
        call("parseTicks", 6, "t", { requestedFields: ["X", "Y"], wantedTicks: [1, 2] }),
      ],
    };
    const wasm = {
      eventEvidence: [event("round_start", 1, "a"), event("player_death", 1, "different")],
      apiCalls: [
        call("parseEvent", 1, "a", {
          eventName: "round_start",
          returnedFields: ["tick", "userid"],
        }),
        call("parseEvent", 1, "different", { eventName: "player_death", returnedFields: ["tick"] }),
        call("parseGrenades", 4, "g"),
        call("parseTicks", 6, "t", { requestedFields: ["X", "Y"], wantedTicks: [1, 2] }),
      ],
    };
    const report = diagnoseRuntimeCalls(python, wasm);
    expect(report.first_divergence).toEqual({
      domain: "player_death",
      reasons: ["ROW_COUNT_MISMATCH", "OUTPUT_DIGEST_MISMATCH", "RETURNED_FIELD_SET_MISMATCH"],
    });
    expect(report.events.find((item) => item.event_name === "round_start").status).toBe("PASS");
    expect(JSON.stringify(report)).not.toContain("samples");
    expect(JSON.stringify(report)).not.toContain("steamid");
  });

  it("isolates grenade and tick call mismatches and request drift", () => {
    const python = {
      eventEvidence: [],
      apiCalls: [
        call("parseGrenades", 4, "g-python"),
        call("parseTicks", 6, "t", { requestedFields: ["X", "Y"], wantedTicks: [1, 2] }),
      ],
    };
    const wasm = {
      eventEvidence: [],
      apiCalls: [
        call("parseGrenades", 5, "g-wasm"),
        call("parseTicks", 6, "t", { requestedFields: ["X", "Z"], wantedTicks: [1, 3] }),
      ],
    };
    const report = diagnoseRuntimeCalls(python, wasm);
    expect(report.grenade.status).toBe("FAIL");
    expect(report.ticks.status).toBe("FAIL"); // request drift is itself a parity failure
    expect(report.ticks.requested_fields.difference.python_only).toEqual(["Y"]);
    expect(report.ticks.requested_fields.difference.wasm_only).toEqual(["Z"]);
    expect(report.ticks.requested_fields.wanted_ticks_equal).toBe(false);
  });

  it("fails closed when per-event evidence is missing", () => {
    const report = diagnoseRuntimeCalls(
      { eventEvidence: [event("round_end", 1, "a")], apiCalls: [] },
      { eventEvidence: [], apiCalls: [] },
    );
    expect(report.events[0].status).toBe("FAIL");
    expect(report.events[0].reasons).toContain("EVENT_EVIDENCE_MISSING");
  });
});
