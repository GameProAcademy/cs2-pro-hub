/**
 * PM2 4.2.4 — `cs2.round-trajectory.v1` on the app side (worker: services/cs2-demo-parser/
 * trajectory.py). Pure: wire sanitation (only the documented shape is accepted) and decoding of the
 * compact sample encoding. A sample is a real entity read; a gap stays a gap (`null`), never an
 * interpolated or zero position.
 */
export const TRAJECTORY_SCHEMA = "cs2.round-trajectory.v1";
export const TRAJECTORY_GAP = -32768;
export const MAX_TRAJECTORY_PLAYERS = 12;
export const MAX_TRAJECTORY_SAMPLES = 1_600;

export type TrajectoryStatus = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export interface TrajectoryPlayerWire {
  steam_id: string;
  side: "T" | "CT";
  /** base64 of little-endian int16 (x, y, z) triples; gap = -32768. */
  xyz: string;
  /** One char per sample: "1" alive, "0" dead, "-" unread. */
  alive: string;
}

export interface TrajectoryRoundWire {
  round: number;
  first_tick: number;
  end_tick: number;
  step_ticks: number;
  sample_count: number;
  players: TrajectoryPlayerWire[];
  dropped_players: number;
}

export interface RoundTrajectoriesWireV1 {
  schema: typeof TRAJECTORY_SCHEMA;
  encoding: string | null;
  status: TrajectoryStatus;
  reason: string | null;
  step_ticks: number | null;
  skipped: { round: number | null; reason: string | null }[];
  rounds: TrajectoryRoundWire[];
}

const isInt = (v: unknown, min = Number.MIN_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Base64 length of `count` int16 triples. */
export const xyzLength = (count: number) => 4 * Math.ceil((6 * count) / 3);

/** Accepts only the documented shape; a malformed player or round is dropped, never repaired. */
export function sanitizeRoundTrajectories(value: unknown): RoundTrajectoriesWireV1 | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v["schema"] !== TRAJECTORY_SCHEMA) return null;
  const status = v["status"];
  if (status !== "COMPLETE" && status !== "PARTIAL" && status !== "UNAVAILABLE") return null;
  const rounds: TrajectoryRoundWire[] = [];
  const seen = new Set<number>();
  for (const raw of Array.isArray(v["rounds"]) ? v["rounds"].slice(0, 256) : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const count = r["sample_count"];
    if (
      !isInt(r["round"], 0) ||
      !isInt(r["first_tick"], 0) ||
      !isInt(r["end_tick"], 0) ||
      !isInt(r["step_ticks"], 1) ||
      !isInt(count, 1) ||
      count > MAX_TRAJECTORY_SAMPLES ||
      (r["end_tick"] as number) < (r["first_tick"] as number) ||
      seen.has(r["round"] as number)
    )
      continue;
    seen.add(r["round"] as number);
    const players: TrajectoryPlayerWire[] = [];
    for (const p of Array.isArray(r["players"])
      ? r["players"].slice(0, MAX_TRAJECTORY_PLAYERS)
      : []) {
      if (!p || typeof p !== "object") continue;
      const q = p as Record<string, unknown>;
      const { steam_id, side, xyz, alive } = q;
      if (
        typeof steam_id !== "string" ||
        !/^\d{1,20}$/.test(steam_id) ||
        (side !== "T" && side !== "CT") ||
        typeof xyz !== "string" ||
        xyz.length !== xyzLength(count) ||
        !B64.test(xyz) ||
        typeof alive !== "string" ||
        alive.length !== count ||
        !/^[01-]*$/.test(alive)
      )
        continue;
      players.push({ steam_id, side, xyz, alive });
    }
    rounds.push({
      round: r["round"] as number,
      first_tick: r["first_tick"] as number,
      end_tick: r["end_tick"] as number,
      step_ticks: r["step_ticks"] as number,
      sample_count: count,
      players,
      dropped_players: isInt(r["dropped_players"], 0) ? r["dropped_players"] : 0,
    });
  }
  const skipped = (Array.isArray(v["skipped"]) ? v["skipped"].slice(0, 256) : []).flatMap((s) =>
    s && typeof s === "object"
      ? [
          {
            round: isInt((s as Record<string, unknown>)["round"])
              ? ((s as Record<string, unknown>)["round"] as number)
              : null,
            reason:
              typeof (s as Record<string, unknown>)["reason"] === "string"
                ? String((s as Record<string, unknown>)["reason"]).slice(0, 32)
                : null,
          },
        ]
      : [],
  );
  return {
    schema: TRAJECTORY_SCHEMA,
    encoding: typeof v["encoding"] === "string" ? v["encoding"].slice(0, 120) : null,
    status,
    reason: typeof v["reason"] === "string" ? v["reason"].slice(0, 64) : null,
    step_ticks: isInt(v["step_ticks"], 1) ? v["step_ticks"] : null,
    skipped,
    rounds: status === "UNAVAILABLE" ? [] : rounds,
  };
}

export interface DecodedSample {
  x: number;
  y: number;
  z: number;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** Decodes one player's samples; gaps are `null`. */
export function decodeSamples(xyz: string, count: number): (DecodedSample | null)[] {
  const bytes = base64ToBytes(xyz);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: (DecodedSample | null)[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * 6;
    if (o + 6 > bytes.byteLength) {
      out.push(null);
      continue;
    }
    const x = view.getInt16(o, true);
    out.push(
      x === TRAJECTORY_GAP
        ? null
        : { x, y: view.getInt16(o + 2, true), z: view.getInt16(o + 4, true) },
    );
  }
  return out;
}

/** "1" → true, "0" → false, "-" → null (unread). */
export const decodeAlive = (alive: string): (boolean | null)[] =>
  [...alive].map((c) => (c === "1" ? true : c === "0" ? false : null));
