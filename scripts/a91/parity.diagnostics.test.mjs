import { describe, expect, it } from "vitest";
import { diagnoseRuntimeCalls } from "./parity.mjs";
import { normalizeEventRows } from "./run_wasm_reference.mjs";

const event = (eventName, count, fullDigest, returnedFields = ["tick", "userid"]) => ({
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
    python.apiCalls[1].returnedFields = ["X", "Y"];
    wasm.apiCalls[1].returnedFields = ["X", "Z"];
    const report = diagnoseRuntimeCalls(python, wasm);
    expect(report.grenade.status).toBe("FAIL");
    expect(report.ticks.status).toBe("FAIL"); // request/output drift is itself a parity failure
    expect(report.ticks.requested_fields.difference.python_only).toEqual(["Y"]);
    expect(report.ticks.requested_fields.difference.wasm_only).toEqual(["Z"]);
    expect(report.ticks.requested_fields.wanted_ticks_equal).toBe(false);
    expect(report.ticks.returned_field_difference.python_only).toEqual(["Y"]);
    expect(report.ticks.returned_field_difference.wasm_only).toEqual(["Z"]);
  });

  it("fails closed when per-event evidence is missing", () => {
    const report = diagnoseRuntimeCalls(
      { eventEvidence: [event("round_end", 1, "a")], apiCalls: [] },
      { eventEvidence: [], apiCalls: [] },
    );
    expect(report.events[0].status).toBe("FAIL");
    expect(report.events[0].reasons).toContain("EVENT_EVIDENCE_MISSING");
  });

  it("exposes returned tick/grenade field differences without raw records", () => {
    const python = {
      eventEvidence: [],
      apiCalls: [
        call("parseGrenades", 9, "g-python", { returnedFields: ["tick", "grenade_type"] }),
        call("parseTicks", 2, "t-python", {
          requestedFields: ["X"],
          wantedTicks: [0, 1],
          returnedFields: ["X", "health"],
        }),
      ],
    };
    const wasm = {
      eventEvidence: [],
      apiCalls: [
        call("parseGrenades", 9, "g-wasm", { returnedFields: ["tick", "entity_id"] }),
        call("parseTicks", 2, "t-wasm", {
          requestedFields: ["X"],
          wantedTicks: [0, 1],
          returnedFields: ["X", "armor"],
        }),
      ],
    };
    const report = diagnoseRuntimeCalls(python, wasm);
    expect(report.grenade.returned_field_difference.python_only).toEqual(["grenade_type"]);
    expect(report.grenade.returned_field_difference.wasm_only).toEqual(["entity_id"]);
    expect(report.ticks.returned_field_difference.python_only).toEqual(["health"]);
    expect(report.ticks.returned_field_difference.wasm_only).toEqual(["armor"]);
    expect(JSON.stringify(report)).not.toContain("samples");
    expect(JSON.stringify(report)).not.toContain("private player row");
  });

  it("normalizes the WASM event wrapper field only when it matches the requested event", () => {
    expect(
      normalizeEventRows(
        [
          { event_name: "player_death", tick: 20, userid: 3 },
          { event_name: "player_death", tick: 21, userid: 4 },
        ],
        "player_death",
      ),
    ).toEqual([
      { tick: 20, userid: 3 },
      { tick: 21, userid: 4 },
    ]);
    expect(normalizeEventRows([{ tick: 20, userid: 3 }], "player_death")).toEqual([
      { tick: 20, userid: 3 },
    ]);
    expect(() =>
      normalizeEventRows([{ event_name: "round_start", tick: 1 }], "player_death"),
    ).toThrow("A91_WASM_EVENT_NAME_MISMATCH");
    expect(() => normalizeEventRows([null], "player_death")).toThrow("A91_WASM_EVENT_ROW_INVALID");
    expect(() => normalizeEventRows({}, "player_death")).toThrow("A91_WASM_EVENT_SHAPE_INVALID");
  });
});
