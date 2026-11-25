import type { SVGProps } from "react";

/**
 * Visual phase V-2: one icon family for game concepts (24 px grid, 2 px stroke, currentColor).
 * Drawn for CS2 PRO: no game, map or brand artwork is reproduced. Decorative by default.
 */
export type GameIconName =
  | "crosshair"
  | "rifle"
  | "pistol"
  | "sniper"
  | "smg"
  | "grenade"
  | "map"
  | "rounds"
  | "clock"
  | "shield"
  | "bomb"
  | "skull"
  | "dna"
  | "target"
  | "alert"
  | "trend";

const PATHS: Record<GameIconName, string[]> = {
  crosshair: [
    "M12 2v5",
    "M12 17v5",
    "M2 12h5",
    "M17 12h5",
    "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  ],
  rifle: ["M2 10h14l2-2h4v4h-5l-2 2H9l-1 5H5l1-5H2z"],
  pistol: ["M3 8h15v4H11l-1 6H6l1-6H3z", "M18 9h3"],
  sniper: ["M2 12h16l2-2h2v4h-3l-2 1H9l-1 4H5l1-5H2z", "M8 9h6", "M11 9V7"],
  smg: ["M3 9h12l2-2h3v4h-4l-1 2h-3l-1 5H8l1-5H3z", "M12 13v3"],
  grenade: ["M12 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M10 7V4h4v3", "M14 4l3-1"],
  map: ["M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z", "M9 4v14", "M15 6v14"],
  rounds: ["M3 5h4v14H3z", "M10 5h4v14h-4z", "M17 5h4v14h-4z"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"],
  bomb: ["M12 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M12 7V4", "M15 4l-3 2", "M9 14h6"],
  skull: [
    "M5 11a7 7 0 0 1 14 0v4l-2 1v3H7v-3l-2-1z",
    "M9 12h.01",
    "M15 12h.01",
    "M10 19v-2",
    "M14 19v-2",
  ],
  dna: ["M7 3c0 6 10 6 10 12s-10 6-10 6", "M17 3c0 6-10 6-10 12", "M8 7h8", "M8 17h8"],
  target: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M12 12h.01",
  ],
  // Attention (warning tone): the role is never colour alone.
  alert: ["M12 3l10 18H2z", "M12 10v4", "M12 17h.01"],
  trend: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
};

export function GameIcon({
  name,
  label,
  className,
  ...rest
}: { name: GameIconName; label?: string | undefined } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-4"}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      data-game-icon={name}
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Weapon category icon for an equipment class; unknown classes fall back to the crosshair. */
export function weaponIcon(weaponClass: string | null | undefined): GameIconName {
  switch ((weaponClass ?? "").toLowerCase()) {
    case "rifle":
      return "rifle";
    case "pistol":
      return "pistol";
    case "sniper":
    case "sniperrifle":
      return "sniper";
    case "smg":
      return "smg";
    case "grenade":
    case "utility":
      return "grenade";
    default:
      return "crosshair";
  }
}
