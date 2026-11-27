/**
 * CS2 asset registry (Visual Game Language 2.0, 2026-11-26).
 *
 * Every file is versioned under public/cs2 (no runtime URL) and listed here with its source, so it
 * can be swapped later without touching a screen. Owner decision for this development phase: use
 * authentic CS2 artwork. Sources (see docs/reference/CS2_ASSETS.md):
 *  - Maps: MurkyYT/cs2-map-icons (extracted from the game depot; images are Valve's property).
 *  - Weapons and HUD: lexogrine/cs2-react-hud (MIT code; the icons are CS2 HUD artwork).
 * An asset never stands for data on its own: it decorates a real map / weapon / event the screen
 * already shows as text. Unknown names return null and the caller keeps its fallback.
 */

export const MAP_ASSETS: Readonly<Record<string, { emblem: string; art: string }>> = {
  de_ancient: { emblem: "/cs2/maps/emblem/de_ancient.webp", art: "/cs2/maps/art/de_ancient.webp" },
  de_anubis: { emblem: "/cs2/maps/emblem/de_anubis.webp", art: "/cs2/maps/art/de_anubis.webp" },
  de_cache: { emblem: "/cs2/maps/emblem/de_cache.webp", art: "/cs2/maps/art/de_cache.webp" },
  de_dust2: { emblem: "/cs2/maps/emblem/de_dust2.webp", art: "/cs2/maps/art/de_dust2.webp" },
  de_inferno: { emblem: "/cs2/maps/emblem/de_inferno.webp", art: "/cs2/maps/art/de_inferno.webp" },
  de_mirage: { emblem: "/cs2/maps/emblem/de_mirage.webp", art: "/cs2/maps/art/de_mirage.webp" },
  de_nuke: { emblem: "/cs2/maps/emblem/de_nuke.webp", art: "/cs2/maps/art/de_nuke.webp" },
  de_overpass: {
    emblem: "/cs2/maps/emblem/de_overpass.webp",
    art: "/cs2/maps/art/de_overpass.webp",
  },
  de_train: { emblem: "/cs2/maps/emblem/de_train.webp", art: "/cs2/maps/art/de_train.webp" },
  de_vertigo: { emblem: "/cs2/maps/emblem/de_vertigo.webp", art: "/cs2/maps/art/de_vertigo.webp" },
};

const WEAPONS = new Set<string>([
  "ak47",
  "aug",
  "awp",
  "bayonet",
  "bizon",
  "c4",
  "cz75a",
  "deagle",
  "decoy",
  "elite",
  "famas",
  "fiveseven",
  "flashbang",
  "g3sg1",
  "galilar",
  "glock",
  "hegrenade",
  "hkp2000",
  "incgrenade",
  "inferno",
  "knife",
  "knife_t",
  "m249",
  "m4a1",
  "m4a1_silencer",
  "mac10",
  "mag7",
  "molotov",
  "mp5sd",
  "mp7",
  "mp9",
  "negev",
  "nova",
  "p250",
  "p90",
  "revolver",
  "sawedoff",
  "scar20",
  "sg556",
  "smokegrenade",
  "ssg08",
  "taser",
  "tec9",
  "trigger_hurt",
  "ump45",
  "usp_silencer",
  "world",
  "xm1014",
]);

/**
 * Weapon art for a weapon name as the parser writes it. "m4a1" (the parser's name for M4A1-S hits)
 * and "hkp2000" (USP-S hits) are ambiguous, so they get no art rather than the wrong silhouette.
 */
const AMBIGUOUS = new Set(["m4a1", "hkp2000"]);

export function weaponArt(weapon: string | null | undefined): string | null {
  if (!weapon || AMBIGUOUS.has(weapon)) return null;
  const name = weapon.startsWith("knife") || weapon === "bayonet" ? "knife" : weapon;
  return WEAPONS.has(name) ? `/cs2/weapons/${name}.svg` : null;
}

export function mapAssets(map: string | null | undefined) {
  if (!map) return null;
  return MAP_ASSETS[map.toLowerCase()] ?? null;
}

export const HUD = {
  bomb: "/cs2/hud/bomb.svg",
  flashed_kill: "/cs2/hud/flashed_kill.svg",
  headshot: "/cs2/hud/headshot.svg",
  icon_armor_helmet_default: "/cs2/hud/icon_armor_helmet_default.svg",
  icon_blind: "/cs2/hud/icon_blind.svg",
  icon_bomb_explosion_default: "/cs2/hud/icon_bomb_explosion_default.svg",
  icon_bullets_default: "/cs2/hud/icon_bullets_default.svg",
  icon_burning: "/cs2/hud/icon_burning.svg",
  icon_c4_default: "/cs2/hud/icon_c4_default.svg",
  icon_defuse_default: "/cs2/hud/icon_defuse_default.svg",
  icon_health_default: "/cs2/hud/icon_health_default.svg",
  icon_skull_default: "/cs2/hud/icon_skull_default.svg",
  icon_timer_default: "/cs2/hud/icon_timer_default.svg",
  logo_CT_default: "/cs2/hud/logo_CT_default.webp",
  logo_T_default: "/cs2/hud/logo_T_default.webp",
  noscope: "/cs2/hud/noscope.svg",
  smoke_kill: "/cs2/hud/smoke_kill.svg",
  wallbang: "/cs2/hud/wallbang.svg",
} as const;
export type HudIconName = keyof typeof HUD;

/** Authentic CS2 silhouette per Player DNA dimension (decorative watermark; shared by DNA and Treino). */
export const DIMENSION_ART: Readonly<Record<string, string>> = {
  aim: "/cs2/weapons/ak47.svg",
  dueling: "/cs2/weapons/deagle.svg",
  survivability: HUD.icon_armor_helmet_default,
  positioning: "/cs2/weapons/awp.svg",
  utility: "/cs2/weapons/hegrenade.svg",
  decision_making: HUD.icon_c4_default,
  teamplay: "/cs2/weapons/flashbang.svg",
  economy: HUD.icon_bullets_default,
  clutch: HUD.icon_defuse_default,
  consistency: HUD.icon_timer_default,
};
