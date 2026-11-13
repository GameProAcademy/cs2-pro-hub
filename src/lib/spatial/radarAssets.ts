/**
 * PM1 / 4.2.2 — radar backgrounds, decoupled from the heatmap engine.
 *
 * The heatmap engine (`heatmap.ts`, `maps.ts`) works only in radar coordinates (0..RADAR_SIZE)
 * and never knows which picture is behind it. This registry says which picture, if any, to draw
 * for a map level. To replace the official images with CS2 PRO's own vectorized radars, add
 * entries of kind `CS2PRO_VECTOR` with the same 1024 × 1024 radar frame (or an SVG viewBox of
 * 0 0 1024 1024) and drop the `VALVE_OFFICIAL_PROVISIONAL` ones — nothing else changes.
 *
 * `VALVE_OFFICIAL_PROVISIONAL`: Valve's official overview images, used provisionally during
 * development and tests by explicit decision of the project owner (2026-11-12). Each file is the
 * CS2 radar texture `panorama/images/overheadmaps/<map>[_lower]_radar_psd.vtex_c` from
 * `game/csgo/pak01_dir.vpk` (Steam app 730, build 25218825), decoded to PNG with
 * Source2Viewer-CLI 20.0.6980 and taken from the extraction published in
 * `@mizar-hud/radar-view@0.1.0`, whose provenance lists the source and output SHA-256 that every
 * file below matches. Only the images (Valve's) are used, none of the package's code.
 * docs/reference/RADAR_ASSETS.md.
 */
import { RADAR_SIZE, type MapLevel } from "@/lib/spatial/maps";

export type RadarAssetKind = "VALVE_OFFICIAL_PROVISIONAL" | "CS2PRO_VECTOR";

export interface RadarAsset {
  map: string;
  level: MapLevel;
  /** Served path (public/). Same frame as the radar transform: RADAR_SIZE × RADAR_SIZE. */
  src: string;
  sha256: string;
  sourcePath: string;
  sourceSha256: string;
}

export const RADAR_ASSET_KIND: RadarAssetKind = "VALVE_OFFICIAL_PROVISIONAL";
export const RADAR_ASSET_SIZE = RADAR_SIZE;

export const RADAR_ASSETS: readonly RadarAsset[] = [
  {
    map: "de_ancient",
    level: "default",
    src: "/radars/cs2/de_ancient-default.png",
    sha256: "cb6adca45e32ecff0b131f742c129324ba5e2dd695247f61d2d21d85ef2c581c",
    sourcePath: "panorama/images/overheadmaps/de_ancient_radar_psd.vtex_c",
    sourceSha256: "944dcf2cbbc7afb6bb3051a8e257ce8cb30552769b017a48fb2dd8603ca1d13f",
  },
  {
    map: "de_anubis",
    level: "default",
    src: "/radars/cs2/de_anubis-default.png",
    sha256: "b8f07c36edb13e34dbfaabf9a74e057961ac4fb29545d98d16ff9b7c4e6d1206",
    sourcePath: "panorama/images/overheadmaps/de_anubis_radar_psd.vtex_c",
    sourceSha256: "737a5548303d284080a3eb43ae5142e49c171373ea64c4eec0ef2bf3f06e3798",
  },
  {
    map: "de_cache",
    level: "default",
    src: "/radars/cs2/de_cache-default.png",
    sha256: "94c058b3deaa5cc24be81006322da3af1ef0bbded116160a3fcdea6d87227967",
    sourcePath: "panorama/images/overheadmaps/de_cache_radar_psd.vtex_c",
    sourceSha256: "d4e20d83760e4e3c5e9b46f674b39c4416cb81f006cb4ebe0efe09e3c1f7b850",
  },
  {
    map: "de_dust2",
    level: "default",
    src: "/radars/cs2/de_dust2-default.png",
    sha256: "0828297130ce26db25a299806ff743df9104de634a3e64b52b358f6f4399354d",
    sourcePath: "panorama/images/overheadmaps/de_dust2_radar_psd.vtex_c",
    sourceSha256: "86c0669d0081aa5ba44954dcbde5e414dc33d2555ffebb6f538458343695e9fc",
  },
  {
    map: "de_inferno",
    level: "default",
    src: "/radars/cs2/de_inferno-default.png",
    sha256: "53e1d660d5e61a9b876cc56725c2e891c56efcb788657520fa9c10fec321dce3",
    sourcePath: "panorama/images/overheadmaps/de_inferno_radar_psd.vtex_c",
    sourceSha256: "08c7e7062434f8bfed07b58b30bdbb200e2fb9dae6b95b655296079789b6da12",
  },
  {
    map: "de_mirage",
    level: "default",
    src: "/radars/cs2/de_mirage-default.png",
    sha256: "c8032f6c83ffca63c0a20ebdcc598a0e1aa618efd746e381e2db26f33a4a964f",
    sourcePath: "panorama/images/overheadmaps/de_mirage_radar_psd.vtex_c",
    sourceSha256: "00171ef3ee89d12038db8341c05c3adcba1d78e9d86371b7586bca921547d6a4",
  },
  {
    map: "de_nuke",
    level: "default",
    src: "/radars/cs2/de_nuke-default.png",
    sha256: "21167d05292e80eebe7b068f0bba36a2e3f9116d154d96952a8366cdcc72e6b1",
    sourcePath: "panorama/images/overheadmaps/de_nuke_radar_psd.vtex_c",
    sourceSha256: "2f91d959876d7f297e790f50f14b6a566fcefef3348fe80c05a132da6f935441",
  },
  {
    map: "de_nuke",
    level: "lower",
    src: "/radars/cs2/de_nuke-lower.png",
    sha256: "b8c4e659491ba79be60b7d3f9bc78bdaeb808afc2bae14bf3b25b1801220ebe0",
    sourcePath: "panorama/images/overheadmaps/de_nuke_lower_radar_psd.vtex_c",
    sourceSha256: "f639b4581b4aee2ea5c48a9bb29ca4d824c6ab0998cc66692d4652f945c79a7f",
  },
  {
    map: "de_overpass",
    level: "default",
    src: "/radars/cs2/de_overpass-default.png",
    sha256: "2a59b62668e80037b5a88e980f56af360269f5ea581d52eb0669d78a981f0d96",
    sourcePath: "panorama/images/overheadmaps/de_overpass_radar_psd.vtex_c",
    sourceSha256: "9f7966f0432976a767b453af821bf8f8b27931d5cfffe87e23e4f892adf2807f",
  },
  {
    map: "de_train",
    level: "default",
    src: "/radars/cs2/de_train-default.png",
    sha256: "ccdb11d6f9fbfb7bf199dfa35d58b3e86131a2c872f38b67502d1be3759e912e",
    sourcePath: "panorama/images/overheadmaps/de_train_radar_psd.vtex_c",
    sourceSha256: "48fbd90340b1044cb87e24a9ea7176f505f9e3008723adf786f9ab07af4979e6",
  },
  {
    map: "de_train",
    level: "lower",
    src: "/radars/cs2/de_train-lower.png",
    sha256: "bc1aa9b1bbcceb06b8e82b7e0980ae11188aa1d460a2e799da9ecd8e21e4d67a",
    sourcePath: "panorama/images/overheadmaps/de_train_lower_radar_psd.vtex_c",
    sourceSha256: "1645976737a4e1f918706640e60403fe694655eead0e5789bb8e402bc4cdc7e1",
  },
  {
    map: "de_vertigo",
    level: "default",
    src: "/radars/cs2/de_vertigo-default.png",
    sha256: "d2e2e18668f951f7d3b7c6a4fe4580632d5de253d0991f4b9639f9eca73264bf",
    sourcePath: "panorama/images/overheadmaps/de_vertigo_radar_psd.vtex_c",
    sourceSha256: "fe1a2e5ceb0c251ee4525a541166de77c9ed733d678e979529c6465274ac8352",
  },
  {
    map: "de_vertigo",
    level: "lower",
    src: "/radars/cs2/de_vertigo-lower.png",
    sha256: "61639197f940d9702f6cb5476a38ae932a821170cdb6405f14733a5b83e32723",
    sourcePath: "panorama/images/overheadmaps/de_vertigo_lower_radar_psd.vtex_c",
    sourceSha256: "8624b80f3adcff621082b279e34e1fb289cff16c02f020f8ac75ecae82839f0f",
  },
];

/** The background for a map level, or null (the UI then draws the neutral grid). */
export function radarAsset(map: string, level: MapLevel): RadarAsset | null {
  return RADAR_ASSETS.find((a) => a.map === map && a.level === level) ?? null;
}
