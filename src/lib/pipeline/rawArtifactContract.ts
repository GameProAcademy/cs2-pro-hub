import { createHash } from "node:crypto";

export const RAW_ARTIFACT_SECTION_ORDER = [
  "header",
  "players",
  "rounds",
  "events",
  "ticks",
  "grenades",
  "player-info",
  "game-state",
  "economy",
  "forensic",
] as const;

export function stableRawArtifactJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableRawArtifactJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableRawArtifactJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function rawArtifactSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}