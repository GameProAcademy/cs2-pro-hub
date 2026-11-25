import type { ReactNode } from "react";

import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { mapDisplayName } from "@/lib/cs2/maps";
import { cn } from "@/lib/utils";

/**
 * Visual phase V-2: the standard badges. Colour carries a role (docs/ux1/VISUAL_SYSTEM.md) and is
 * never the only signal: every badge has a text label, sides and alerts also an icon. Absence is
 * dashed and neutral, never filled and never zero.
 */
export type BadgeTone =
  "brand" | "context" | "attention" | "critical" | "neutral" | "ct" | "t" | "utility";

const TONES: Record<BadgeTone, string> = {
  brand: "bg-primary/12 text-primary border-primary/25",
  context: "bg-context/12 text-context border-context/25",
  attention: "bg-warning/12 text-warning border-warning/30",
  critical: "bg-destructive/12 text-destructive border-destructive/30",
  neutral: "bg-transparent text-muted-foreground border-dashed border-border-strong",
  ct: "bg-side-ct/12 text-side-ct border-side-ct/30",
  t: "bg-side-t/12 text-side-t border-side-t/30",
  utility: "bg-category-utility/12 text-category-utility border-category-utility/30",
};

export function ToneBadge({
  tone,
  icon,
  children,
  className,
  ...rest
}: {
  tone: BadgeTone;
  icon?: GameIconName | undefined;
  children: ReactNode;
  className?: string | undefined;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold leading-5",
        TONES[tone],
        className,
      )}
      data-tone={tone}
      {...rest}
    >
      {icon ? <GameIcon name={icon} className="size-3" /> : null}
      {children}
    </span>
  );
}

/** CT / T: own tokens, own icon, always the side label. Null side renders nothing. */
export function SideBadge({
  side,
  className,
}: {
  side: "CT" | "T" | null | undefined;
  className?: string;
}) {
  if (side !== "CT" && side !== "T") return null;
  return (
    <ToneBadge
      tone={side === "CT" ? "ct" : "t"}
      icon={side === "CT" ? "shield" : "bomb"}
      className={className}
      data-side={side}
    >
      {side}
    </ToneBadge>
  );
}

/** Two-letter map identifier with its own tone; no official map artwork. */
const MAP_CODES: Record<string, string> = {
  de_mirage: "MI",
  de_dust2: "D2",
  de_inferno: "IN",
  de_nuke: "NU",
  de_ancient: "AC",
  de_anubis: "AN",
  de_vertigo: "VE",
  de_overpass: "OV",
  de_train: "TR",
  de_cache: "CA",
};

export function mapCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (MAP_CODES[key]) return MAP_CODES[key]!;
  const name = mapDisplayName(raw).replace(/[^A-Za-z0-9]/g, "");
  return name ? name.slice(0, 2).toUpperCase() : null;
}

export function MapBadge({
  map,
  showName = true,
  className,
}: {
  map: string | null | undefined;
  showName?: boolean | undefined;
  className?: string | undefined;
}) {
  const code = mapCode(map);
  if (!code) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border-strong bg-elevated px-2 py-1 font-mono text-xs font-semibold text-foreground",
        className,
      )}
      data-map-badge={map ?? ""}
    >
      <span
        className="flex h-5 min-w-6 items-center justify-center rounded-sm bg-context/15 px-0.5 text-xs leading-none text-context"
        aria-hidden
      >
        {code}
      </span>
      {showName ? mapDisplayName(map) : <span className="sr-only">{mapDisplayName(map)}</span>}
    </span>
  );
}
