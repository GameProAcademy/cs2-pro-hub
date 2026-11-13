/**
 * PM1 / 4.2.2 — map overviews and the world → radar transform (`radar-transform-v1`). Pure.
 *
 * Source of every number below: the game's own overview files `resource/overviews/<map>.txt`
 * inside `game/csgo/pak01_dir.vpk` (Counter-Strike 2, Steam app 730, build 25218825), with the
 * SHA-256 of each source file. The numbers were cross-checked against the extraction provenance
 * published with the npm package `@mizar-hud/radar-view@0.1.0` (dist/radar-provenance.json);
 * nothing from that package (AGPL) is included here, only the facts with their origin.
 * Transform, as documented by Valve for working minimaps
 * (https://developer.valvesoftware.com/wiki/Creating_a_working_mini-map):
 *   radar_x = (world_x − pos_x) / scale,  radar_y = (pos_y − world_y) / scale,
 * on a RADAR_SIZE × RADAR_SIZE overview image. Maps with vertical sections split levels by
 * world z at the lower section's AltitudeMax.
 *
 * A map is SUPPORTED only after its transform was validated against reference points from real
 * positions of that map; otherwise it is NOT_VALIDATED and no heatmap is drawn for it (PM1 §7.4:
 * never show a heatmap as if correct when the transform is not reliable).
 */

export const RADAR_TRANSFORM_VERSION = "radar-transform-v1";
export const RADAR_SIZE = 1024;
export const OVERVIEW_SOURCE = {
  appId: 730,
  steamBuildId: "25218825",
  container: "game/csgo/pak01_dir.vpk",
} as const;

export type MapLevel = "default" | "lower";
export type MapValidation = "VALIDATED" | "NOT_VALIDATED";

export interface MapOverview {
  map: string;
  posX: number;
  posY: number;
  scale: number;
  /** World z below which a position is on the lower level; null = single level. */
  lowerLevelMaxZ: number | null;
  sourcePath: string;
  sourceSha256: string;
  validation: MapValidation;
  /** What the validation compared (reference points from real positions), or why it is missing. */
  validationEvidence: string;
}

const NOT_VALIDATED_YET =
  "Official overview parameters; not yet compared with real positions of this map (needs one authorized demo of the map).";

export const MAP_OVERVIEWS: Readonly<Record<string, MapOverview>> = {
  de_dust2: {
    map: "de_dust2",
    posX: -2476,
    posY: 3239,
    scale: 4.4,
    lowerLevelMaxZ: null,
    sourcePath: "resource/overviews/de_dust2.txt",
    sourceSha256: "63e4e5a5dd7ffbf741cd48f0f8466cfcb9cf35dca55b5315c7a3123b0e59d28f",
    validation: "VALIDATED",
    validationEvidence:
      "Authorized benchmark demo (furia-vs-gamerlegion-m3-dust2, sha256 1c271096…): 200/200 death-tick positions inside the radar; T spawn at freeze end radar (380, 915) and CT spawn (621, 187), 30 samples each; bomb plants in two clusters at the two sites, radar (~250, 153) and (~790, 163). Orientation and scale consistent, no mirroring. docs/reference/SPATIAL_HEATMAP.md.",
  },
  de_mirage: {
    map: "de_mirage",
    posX: -3230,
    posY: 1713,
    scale: 5,
    lowerLevelMaxZ: null,
    sourcePath: "resource/overviews/de_mirage.txt",
    sourceSha256: "0c3b215f175afdb5b4cf5e824c950101f17be5ad8e2afd2037bfc757a85c67e3",
    validation: "NOT_VALIDATED",
    validationEvidence: NOT_VALIDATED_YET,
  },
  de_inferno: {
    map: "de_inferno",
    posX: -2087,
    posY: 3870,
    scale: 4.9,
    lowerLevelMaxZ: null,
    sourcePath: "resource/overviews/de_inferno.txt",
    sourceSha256: "6a1816bde20f19ba25b7b3bf464c39c0671716ef48ec93697e33517bf61ed9b3",
    validation: "NOT_VALIDATED",
    validationEvidence: NOT_VALIDATED_YET,
  },
  de_nuke: {
    map: "de_nuke",
    posX: -3453,
    posY: 2887,
    scale: 7,
    lowerLevelMaxZ: -495,
    sourcePath: "resource/overviews/de_nuke.txt",
    sourceSha256: "35d6313b94087ec99ad62b6cd3cd3e7647ed2040cdde037a4e30c9c37c3f5c9d",
    validation: "NOT_VALIDATED",
    validationEvidence: NOT_VALIDATED_YET,
  },
  de_ancient: {
    map: "de_ancient",
    posX: -2953,
    posY: 2164,
    scale: 5,
    lowerLevelMaxZ: null,
    sourcePath: "resource/overviews/de_ancient.txt",
    sourceSha256: "91b1312014d08aa5b5610b0c3c120a2b950ae4f83604643cbeb546843bd9b245",
    validation: "NOT_VALIDATED",
    validationEvidence: NOT_VALIDATED_YET,
  },
  de_anubis: {
    map: "de_anubis",
    posX: -2796,
    posY: 3328,
    scale: 5.22,
    lowerLevelMaxZ: null,
    sourcePath: "resource/overviews/de_anubis.txt",
    sourceSha256: "efc7d90f751c69ed0f7c2bca97dda1ae0ce645bec4a2449108a31e60876d7ace",
    validation: "NOT_VALIDATED",
    validationEvidence: NOT_VALIDATED_YET,
  },
  de_cache: {
    map: "de_cache",
    posX: -2000,
    posY: 3250,
    scale: 5.5,
    lowerLevelMaxZ: null,
    sourcePath: "resource/overviews/de_cache.txt",
    sourceSha256: "f449c1acf7abe2b4ec460f80c232c5b1a1834bbed404f9781b06ce6dc9973063",
    validation: "NOT_VALIDATED",
    validationEvidence: NOT_VALIDATED_YET,
  },
  de_overpass: {
    map: "de_overpass",
    posX: -4831,
    posY: 1781,
    scale: 5.2,
    lowerLevelMaxZ: null,
    sourcePath: "resource/overviews/de_overpass.txt",
    sourceSha256: "69dab35c05c8fb0e2b8ee1ebce57d4670271a067fd07acd4db0ad48c622bd712",
    validation: "NOT_VALIDATED",
    validationEvidence: NOT_VALIDATED_YET,
  },
  de_train: {
    map: "de_train",
    posX: -2308,
    posY: 2078,
    scale: 4.082077,
    lowerLevelMaxZ: -50,
    sourcePath: "resource/overviews/de_train.txt",
    sourceSha256: "af802b4000a2f92344fb0133b3417f88283d743fc834757dd3ffa0d6eab5c574",
    validation: "NOT_VALIDATED",
    validationEvidence: NOT_VALIDATED_YET,
  },
  de_vertigo: {
    map: "de_vertigo",
    posX: -3168,
    posY: 1762,
    scale: 4,
    lowerLevelMaxZ: 11700,
    sourcePath: "resource/overviews/de_vertigo.txt",
    sourceSha256: "92f45f79a55c721a2f2f0d38fa7240a228e2c0a2db44c3f27919dc971682e9f7",
    validation: "NOT_VALIDATED",
    validationEvidence: NOT_VALIDATED_YET,
  },
};

/** `matches.map` as persisted ("de_dust2"); workshop paths and case are normalized. */
export function normalizeMapName(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().toLowerCase().split(/[\\/]/).pop() ?? "";
  return /^[a-z0-9_]{1,64}$/.test(name) ? name : null;
}

export type MapSupport =
  | { status: "SUPPORTED"; overview: MapOverview }
  | { status: "NOT_VALIDATED"; overview: MapOverview }
  | { status: "UNKNOWN_MAP"; overview: null };

export function mapSupport(raw: string | null | undefined): MapSupport {
  const name = normalizeMapName(raw);
  const overview = name ? MAP_OVERVIEWS[name] : undefined;
  if (!overview) return { status: "UNKNOWN_MAP", overview: null };
  return overview.validation === "VALIDATED"
    ? { status: "SUPPORTED", overview }
    : { status: "NOT_VALIDATED", overview };
}

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

/** Why a recorded position is not drawn. Never replaced by (0, 0). */
export type PositionRejection = "MISSING" | "INVALID" | "SUSPECT_ORIGIN" | "OUT_OF_BOUNDS";

/**
 * Pure: a persisted `{x, y, z}` (jsonb) as a world position, or why not. Missing objects or
 * coordinates → MISSING; non-numbers / non-finite → INVALID; exactly (0, 0, 0) is a known
 * default-fill pattern, never a real sample worth trusting → SUSPECT_ORIGIN.
 */
export function readWorldPosition(
  value: unknown,
): { ok: true; position: WorldPosition } | { ok: false; reason: PositionRejection } {
  if (value === null || value === undefined) return { ok: false, reason: "MISSING" };
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "INVALID" };
  const v = value as Record<string, unknown>;
  if (v["x"] === undefined || v["y"] === undefined || v["z"] === undefined)
    return { ok: false, reason: "MISSING" };
  const [x, y, z] = [v["x"], v["y"], v["z"]];
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number")
    return { ok: false, reason: "INVALID" };
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
    return { ok: false, reason: "INVALID" };
  if (x === 0 && y === 0 && z === 0) return { ok: false, reason: "SUSPECT_ORIGIN" };
  return { ok: true, position: { x, y, z } };
}

export interface RadarPoint {
  /** Radar pixels, 0..RADAR_SIZE, origin top-left. */
  x: number;
  y: number;
  level: MapLevel;
}

/** Pure: world → radar for one map; outside the overview image → OUT_OF_BOUNDS. */
export function worldToRadar(
  overview: MapOverview,
  p: WorldPosition,
): { ok: true; point: RadarPoint } | { ok: false; reason: "OUT_OF_BOUNDS" } {
  const x = (p.x - overview.posX) / overview.scale;
  const y = (overview.posY - p.y) / overview.scale;
  if (!(x >= 0 && x <= RADAR_SIZE && y >= 0 && y <= RADAR_SIZE))
    return { ok: false, reason: "OUT_OF_BOUNDS" };
  const level: MapLevel =
    overview.lowerLevelMaxZ !== null && p.z < overview.lowerLevelMaxZ ? "lower" : "default";
  return { ok: true, point: { x, y, level } };
}
