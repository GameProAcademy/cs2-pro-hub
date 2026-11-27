/**
 * Visual Game Language (2026-11-26): CS2 elements that stand for real data.
 *
 * Every element here is drawn for CS2 PRO (no Valve or third-party artwork) and is only rendered
 * next to the value it represents: the weapon of a real kill, the grenade type of a real throw,
 * the map of a real match. The text is always present; the pictogram never carries meaning alone.
 * Nothing here reads, computes or changes data.
 */
import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { mapCode } from "@/components/common/VisualBadges";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { UTILITY_WEAPONS, weaponClass, type WeaponClass } from "@/lib/combat/weapons";
import { mapDisplayName } from "@/lib/cs2/maps";
import type { Grenade } from "@/lib/utility/utility";
import { cn } from "@/lib/utils";

const CLASS_ICON: Record<WeaponClass, GameIconName> = {
  rifle: "rifle",
  sniper: "sniper",
  smg: "smg",
  heavy: "heavy",
  pistol: "pistol",
  knife: "knife",
  other: "crosshair",
};

/** Grenade family of a thrown-utility weapon name (as the parser writes it). */
const UTILITY_GRENADE: Record<string, Grenade> = {
  flashbang: "flash",
  hegrenade: "he",
  smokegrenade: "smoke",
  molotov: "fire",
  incgrenade: "fire",
  inferno: "fire",
  decoy: "decoy",
};

export const GRENADE_ICON: Record<Grenade, GameIconName> = {
  flash: "flash",
  he: "grenade",
  smoke: "smoke",
  fire: "fire",
  decoy: "decoy",
};

/**
 * Display names only where the parser's name is unambiguous. The parser names the M4A1-S "m4a1"
 * and the USP-S "hkp2000" in hit events (src/lib/combat/weapons.ts), so those keep their raw name
 * rather than a guessed one.
 */
const DISPLAY: Record<string, string> = {
  ak47: "AK-47",
  m4a1_silencer: "M4A1-S",
  galilar: "Galil AR",
  famas: "FAMAS",
  aug: "AUG",
  sg556: "SG 553",
  awp: "AWP",
  ssg08: "SSG 08",
  scar20: "SCAR-20",
  g3sg1: "G3SG1",
  mp9: "MP9",
  mac10: "MAC-10",
  mp7: "MP7",
  mp5sd: "MP5-SD",
  ump45: "UMP-45",
  p90: "P90",
  bizon: "PP-Bizon",
  nova: "Nova",
  xm1014: "XM1014",
  sawedoff: "Sawed-Off",
  mag7: "MAG-7",
  m249: "M249",
  negev: "Negev",
  glock: "Glock-18",
  usp_silencer: "USP-S",
  p250: "P250",
  elite: "Dual Berettas",
  fiveseven: "Five-SeveN",
  tec9: "Tec-9",
  cz75a: "CZ75-Auto",
  deagle: "Desert Eagle",
  revolver: "R8 Revolver",
  taser: "Zeus x27",
};

export function weaponDisplayName(weapon: string): string {
  return DISPLAY[weapon] ?? weapon;
}

/** Pictogram for a weapon name, or null when the name is not a player weapon we can classify. */
export function weaponIcon(weapon: string | null | undefined): GameIconName | null {
  if (!weapon) return null;
  const grenade = UTILITY_GRENADE[weapon];
  if (grenade) return GRENADE_ICON[grenade];
  if (weapon === "planted_c4" || weapon === "c4") return "bomb";
  if (UTILITY_WEAPONS.has(weapon)) return "grenade";
  const cls = weaponClass(weapon);
  return cls ? CLASS_ICON[cls] : null;
}

/** A real weapon name with its class pictogram. Renders nothing for a missing weapon. */
export function WeaponLabel({
  weapon,
  className,
}: {
  weapon: string | null | undefined;
  className?: string | undefined;
}) {
  if (!weapon) return null;
  const icon = weaponIcon(weapon);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      data-weapon={weapon}
      data-weapon-icon={icon ?? "none"}
    >
      {icon ? <GameIcon name={icon} className="size-4 shrink-0 text-muted-foreground" /> : null}
      <span>{weaponDisplayName(weapon)}</span>
    </span>
  );
}

/** A grenade type with its pictogram in the utility tone (the only use of purple). */
export function GrenadeLabel({
  grenade,
  className,
}: {
  grenade: Grenade;
  className?: string | undefined;
}) {
  const t = useT();
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} data-grenade={grenade}>
      <GameIcon name={GRENADE_ICON[grenade]} className="size-4 shrink-0 text-category-utility" />
      <span>{t(`nade.grenade.${grenade}` as TranslationKey)}</span>
    </span>
  );
}

const TILE_SIZE = {
  sm: "size-8 text-xs",
  md: "size-11 text-sm",
  lg: "size-14 text-base",
} as const;

/**
 * Map tile: an original tactical tile (grid, corner ticks, map code). It identifies the map of a
 * real match; it is not a radar and draws no position. Unknown map → nothing (callers keep their
 * own "not available" text).
 */
export function MapTile({
  map,
  size = "md",
  showName = false,
  className,
}: {
  map: string | null | undefined;
  size?: keyof typeof TILE_SIZE;
  showName?: boolean;
  className?: string | undefined;
}) {
  const code = mapCode(map);
  if (!code) return null;
  const name = mapDisplayName(map);
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-2.5", className)}
      data-map-tile={map ?? ""}
    >
      <span
        aria-hidden
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-context/30 bg-elevated font-mono font-semibold leading-none text-context",
          "bg-[linear-gradient(to_right,color-mix(in_oklab,var(--context)_12%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--context)_12%,transparent)_1px,transparent_1px)] bg-[size:25%_25%]",
          TILE_SIZE[size],
        )}
      >
        <span className="absolute left-1 top-1 size-1.5 border-l border-t border-context/60" />
        <span className="absolute bottom-1 right-1 size-1.5 border-b border-r border-context/60" />
        <span className="relative">{code}</span>
      </span>
      {showName ? (
        <span className="truncate font-display font-semibold text-foreground">{name}</span>
      ) : (
        <span className="sr-only">{name}</span>
      )}
    </span>
  );
}

export type RoundEventKind =
  "kill" | "death" | "assist" | "headshot" | "trade" | "opening" | "clutch" | "plant" | "defuse";

export const EVENT_ICON: Record<RoundEventKind, GameIconName> = {
  kill: "kill",
  death: "skull",
  assist: "assist",
  headshot: "headshot",
  trade: "trade",
  opening: "opening",
  clutch: "clutch",
  plant: "bomb",
  defuse: "defuse",
};
