/**
 * CS2 MAP POOL — versioned, never hardcoded inside components.
 *
 * The Active Duty pool changes over time. Every change is a new version with an
 * explicit `effectiveFrom` date, so a match played in the past is always judged
 * against the pool that was active THEN, never against today's pool.
 *
 * Only pool versions we can state with confidence are recorded here. Absence of
 * an intermediate version is not an error: `resolveMapPool` always returns the
 * most recent version effective at the requested date.
 */
export const CS2_MAP_CODES = [
  "ancient",
  "anubis",
  "cache",
  "dust2",
  "inferno",
  "mirage",
  "nuke",
  "overpass",
  "train",
  "vertigo",
  "office",
  "italy",
] as const;

export type Cs2MapCode = (typeof CS2_MAP_CODES)[number];

export const CS2_MAP_NAMES: Record<Cs2MapCode, string> = {
  ancient: "Ancient",
  anubis: "Anubis",
  cache: "Cache",
  dust2: "Dust II",
  inferno: "Inferno",
  mirage: "Mirage",
  nuke: "Nuke",
  overpass: "Overpass",
  train: "Train",
  vertigo: "Vertigo",
  office: "Office",
  italy: "Italy",
};

export interface Cs2MapPoolVersion {
  version: number;
  /** ISO date (UTC) the pool became effective. */
  effectiveFrom: string;
  activeDuty: readonly Cs2MapCode[];
  /** Human note for auditing why the version exists. */
  note: string;
}

/** Ordered oldest -> newest. */
export const CS2_MAP_POOL_VERSIONS: readonly Cs2MapPoolVersion[] = [
  {
    version: 1,
    effectiveFrom: "2023-09-27",
    activeDuty: ["ancient", "anubis", "inferno", "mirage", "nuke", "overpass", "vertigo"],
    note: "CS2 launch Active Duty pool.",
  },
  {
    version: 2,
    effectiveFrom: "2026-07-08",
    activeDuty: ["ancient", "anubis", "cache", "dust2", "inferno", "mirage", "nuke"],
    note: "Cache enters Active Duty; Overpass leaves Active Duty.",
  },
] as const;

export const CURRENT_MAP_POOL_VERSION =
  CS2_MAP_POOL_VERSIONS[CS2_MAP_POOL_VERSIONS.length - 1]!;

function timeOf(value: Date | string): number {
  const date = typeof value === "string" ? new Date(value) : value;
  const time = date.getTime();
  return Number.isNaN(time) ? Date.now() : time;
}

/** Pool version effective at `at`. Dates before the first version return v1. */
export function resolveMapPool(at: Date | string = new Date()): Cs2MapPoolVersion {
  const time = timeOf(at);
  let resolved = CS2_MAP_POOL_VERSIONS[0]!;
  for (const version of CS2_MAP_POOL_VERSIONS) {
    if (timeOf(version.effectiveFrom) <= time) resolved = version;
  }
  return resolved;
}

export function activeDutyMaps(at: Date | string = new Date()): readonly Cs2MapCode[] {
  return resolveMapPool(at).activeDuty;
}

export function isActiveDuty(code: string, at: Date | string = new Date()): boolean {
  const normalized = normalizeMapCode(code);
  return normalized !== null && activeDutyMaps(at).includes(normalized);
}

/** `de_dust2`, "Dust 2", "DUST II" -> "dust2". Unknown input -> null. */
export function normalizeMapCode(raw: string | null | undefined): Cs2MapCode | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/^(de|cs|ar)_/, "")
    .replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, Cs2MapCode> = {
    dust2: "dust2",
    dustii: "dust2",
    dust: "dust2",
    d2: "dust2",
    trainstation: "train",
  };
  if (aliases[cleaned]) return aliases[cleaned]!;
  return (CS2_MAP_CODES as readonly string[]).includes(cleaned) ? (cleaned as Cs2MapCode) : null;
}

export function mapDisplayName(raw: string | null | undefined): string {
  const code = normalizeMapCode(raw);
  if (code) return CS2_MAP_NAMES[code];
  return raw?.trim() ? raw.trim() : "—";
}

export type MapPoolStatus = "active_duty" | "out_of_pool" | "unknown";

export function mapPoolStatus(
  raw: string | null | undefined,
  at: Date | string = new Date(),
): MapPoolStatus {
  const code = normalizeMapCode(raw);
  if (!code) return "unknown";
  return activeDutyMaps(at).includes(code) ? "active_duty" : "out_of_pool";
}
