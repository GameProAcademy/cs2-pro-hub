/**
 * PM3 — weapon vocabulary shared by modules C (duels/aim) and D (utility).
 *
 * Names are the ones demoparser2 writes in round_events.weapon. Caveats proven on real demos
 * (FURIA×Vitality Dust2, 2026-11-17): player_hurt names the M4A1-S "m4a1" and the USP-S "hkp2000"
 * (base item), while player_death and weapon_fire use "m4a1_silencer"/"usp_silencer". So a hit is
 * tied to its shot by shooter + tick (100% in the corpus), never by weapon name, and the weapon of a
 * hit is the weapon of its shot.
 */
export type WeaponClass = "rifle" | "sniper" | "smg" | "heavy" | "pistol" | "knife" | "other";

const CLASSES: Record<Exclude<WeaponClass, "knife" | "other">, readonly string[]> = {
  rifle: ["ak47", "m4a1", "m4a1_silencer", "galilar", "famas", "aug", "sg556"],
  sniper: ["awp", "ssg08", "scar20", "g3sg1"],
  smg: ["mp9", "mac10", "mp7", "mp5sd", "ump45", "p90", "bizon"],
  heavy: ["nova", "xm1014", "sawedoff", "mag7", "m249", "negev"],
  pistol: [
    "glock",
    "usp_silencer",
    "hkp2000",
    "p2000",
    "p250",
    "elite",
    "fiveseven",
    "tec9",
    "cz75a",
    "deagle",
    "revolver",
  ],
};
const BY_NAME = new Map<string, WeaponClass>(
  Object.entries(CLASSES).flatMap(([cls, names]) => names.map((n) => [n, cls as WeaponClass])),
);

/** Thrown utility and its damage sources. Never part of an aim duel. */
export const UTILITY_WEAPONS = new Set([
  "hegrenade",
  "flashbang",
  "smokegrenade",
  "molotov",
  "incgrenade",
  "inferno",
  "decoy",
]);
/** Damage with no player weapon behind it. */
export const WORLD_WEAPONS = new Set(["world", "planted_c4", "trigger_hurt", "worldspawn"]);

export function isKnife(weapon: string | null): boolean {
  return !!weapon && (weapon.startsWith("knife") || weapon === "bayonet");
}

export function weaponClass(weapon: string | null): WeaponClass | null {
  if (!weapon) return null;
  if (isKnife(weapon)) return "knife";
  return (
    BY_NAME.get(weapon) ??
    (UTILITY_WEAPONS.has(weapon) || WORLD_WEAPONS.has(weapon) ? null : "other")
  );
}

/** A bullet weapon: its shots and hits count for accuracy. Knife, zeus and utility do not. */
export function isFirearm(weapon: string | null): boolean {
  const cls = weaponClass(weapon);
  return cls !== null && cls !== "knife" && cls !== "other";
}

/** Weapons whose spray (shots 2+ of a burst) is meaningful for the burst profile. */
export function isAutomatic(weapon: string | null): boolean {
  const cls = weaponClass(weapon);
  return cls === "rifle" || cls === "smg" || weapon === "m249" || weapon === "negev";
}

/** Grenade names as weapon_fire writes them (a throw). */
export const GRENADE_THROWS = new Set([
  "flashbang",
  "smokegrenade",
  "hegrenade",
  "molotov",
  "incgrenade",
  "decoy",
]);
