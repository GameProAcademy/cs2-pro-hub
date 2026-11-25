import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  opaqueEventKey,
  participantRefs,
  resolveParticipantRef,
} from "@/lib/pipeline-identity.functions";

/** #368b: the identity picker never sends a SteamID-shaped key to the browser. */
const players = [
  { participantKey: "76561198014259134" },
  { participantKey: "76561197960690195" },
  { participantKey: "76561198000000001" },
];

describe("#368b opaque participant references", () => {
  it("maps keys to p1…pN in key order, stable regardless of input order", () => {
    const a = participantRefs(players);
    const b = participantRefs([...players].reverse());
    expect([...a.values()]).toEqual(["p1", "p2", "p3"]);
    expect(a.get("76561197960690195")).toBe("p1");
    expect([...a.entries()]).toEqual([...b.entries()]);
    for (const ref of a.values()) expect(ref).not.toMatch(/\d{17}/);
  });
  it("resolves a reference back to its key; unknown refs and raw keys are refused", () => {
    expect(resolveParticipantRef(players, "p2")).toBe("76561198000000001");
    expect(resolveParticipantRef(players, "p9")).toBeNull();
    expect(resolveParticipantRef(players, "76561198014259134")).toBeNull();
  });
  it("getDemoIdentity never returns a raw participant key", () => {
    const src = readFileSync("src/lib/pipeline-identity.functions.ts", "utf8");
    const start = src.indexOf("export const getDemoIdentity");
    const body = src.slice(start, src.indexOf("export interface DeclareResult"));
    expect(body).not.toMatch(/participantKey: (participant|suggestion)\.participantKey,/);
    expect(body).not.toMatch(/: job\.(attachment|declared)_participant_key,/);
    expect(body).not.toMatch(/steamId/);
  });
  it("#368c: the decision event key carries the ref, never the SteamID", () => {
    const refs = participantRefs(players);
    const ref = (k: string | null) => (k ? (refs.get(k) ?? null) : null);
    expect(opaqueEventKey("manual:76561198000000001", ref)).toBe("manual:p2");
    expect(opaqueEventKey("manual:76561190000000000", ref)).toBe("manual:unknown");
    expect(opaqueEventKey("manual:unresolved", ref)).toBe("manual:unresolved");
    expect(opaqueEventKey("auto:steam:76561197960690195", ref)).toBe("auto:steam:p1");
    expect(opaqueEventKey(null, ref)).toBeNull();
  });
});
