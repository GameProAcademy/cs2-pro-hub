/**
 * Visual Game Language 2.0 — authentic CS2 artwork as UI building blocks.
 *
 * Every piece is decorative (aria-hidden) and sits next to the value it illustrates, which stays
 * written as text. Monochrome HUD/weapon icons are drawn as CSS masks so they take the semantic
 * colour tokens (CT, T, utility, lima) instead of the art's own white.
 */
import type { CSSProperties, ReactNode } from "react";

import { HUD, mapAssets, weaponArt, type HudIconName } from "@/lib/cs2/assets";
import { cn } from "@/lib/utils";

/** A white SVG from the pack, tinted with currentColor through a CSS mask. */
export function Cs2Mask({
  src,
  className,
  style,
}: {
  src: string;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        ...style,
      }}
      data-cs2-mask={src}
    />
  );
}

/** The killfeed silhouette of a real weapon, or nothing when there is no unambiguous art. */
export function WeaponArt({
  weapon,
  className,
}: {
  weapon: string | null | undefined;
  className?: string | undefined;
}) {
  const src = weaponArt(weapon);
  if (!src) return null;
  return <Cs2Mask src={src} className={cn("h-4 w-10", className)} />;
}

export function HudIcon({
  name,
  className,
}: {
  name: HudIconName;
  className?: string | undefined;
}) {
  const src = HUD[name];
  if (src.endsWith(".webp"))
    return (
      <img src={src} alt="" aria-hidden className={cn("shrink-0 object-contain", className)} />
    );
  return <Cs2Mask src={src} className={cn("size-4", className)} />;
}

/** CT / T emblem from the game HUD (decorative; the side label is always written next to it). */
export function SideLogo({
  side,
  className,
}: {
  side: "CT" | "T";
  className?: string | undefined;
}) {
  return (
    <HudIcon name={side === "CT" ? "logo_CT_default" : "logo_T_default"} className={className} />
  );
}

/** The official map emblem (badge). Unknown map → null; callers keep their own fallback. */
export function MapEmblem({
  map,
  className,
}: {
  map: string | null | undefined;
  className?: string | undefined;
}) {
  const a = mapAssets(map);
  if (!a) return null;
  return (
    <img
      src={a.emblem}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      className={cn("shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]", className)}
      data-map-emblem={map ?? ""}
    />
  );
}

/**
 * A panel backed by the map's in-game art, darkened by a gradient so text stays readable
 * (contrast is carried by the overlay, not by the picture). No art → plain elevated surface.
 */
export function MapArt({
  map,
  children,
  className,
  overlay = "strong",
}: {
  map: string | null | undefined;
  children?: ReactNode;
  className?: string | undefined;
  overlay?: "strong" | "soft";
}) {
  const a = mapAssets(map);
  return (
    <div
      className={cn("relative isolate overflow-hidden bg-elevated", className)}
      data-map-art={a ? (map ?? "") : "none"}
    >
      {a ? (
        <img
          src={a.art}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="vgl-art absolute inset-0 -z-10 size-full object-cover"
        />
      ) : null}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 -z-10",
          overlay === "strong"
            ? "bg-[linear-gradient(90deg,var(--background)_0%,color-mix(in_oklab,var(--background)_88%,transparent)_45%,color-mix(in_oklab,var(--background)_55%,transparent)_100%)]"
            : "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_35%,transparent)_0%,color-mix(in_oklab,var(--background)_92%,transparent)_100%)]",
        )}
      />
      {children}
    </div>
  );
}

/**
 * Radial gauge for a 0–1 index the page already shows. `value === null` draws a dashed neutral ring
 * (never an empty "0"); `label` is what is written inside (the caller decides number or state).
 */
export function RadialGauge({
  value,
  label,
  size = 72,
  tone = "brand",
  className,
}: {
  value: number | null;
  label: ReactNode;
  size?: number;
  tone?: "brand" | "context" | "attention";
  className?: string | undefined;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? null : Math.max(0, Math.min(1, value));
  const color =
    tone === "context"
      ? "var(--context)"
      : tone === "attention"
        ? "var(--warning)"
        : "var(--primary)";
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      data-gauge={v === null ? "none" : v.toFixed(3)}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={stroke}
          strokeDasharray={v === null ? "3 5" : undefined}
        />
        {v !== null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`}
            className="vgl-ring"
            style={{ "--vgl-ring-len": `${c}` } as CSSProperties}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-center">{label}</span>
    </span>
  );
}
