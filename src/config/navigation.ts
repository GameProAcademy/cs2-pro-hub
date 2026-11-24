import {
  Bot,
  Dna,
  Flag,
  Gauge,
  LayoutDashboard,
  ListOrdered,
  MapPinned,
  Stethoscope,
  Target,
  Upload,
  User,
  Skull,
  Film,
  Crosshair,
  Bomb,
  Coins,
  TrendingUp,
  Bookmark,
} from "lucide-react";

import type { TranslationKey } from "@/i18n/config";

export interface NavItem {
  /** i18n key — never a literal label. */
  labelKey: TranslationKey;
  to: string;
  icon: typeof LayoutDashboard;
  /** Shown in the mobile bottom navigation. */
  primary?: boolean;
}

export const navItems: NavItem[] = [
  { labelKey: "nav.dashboard", to: "/dashboard", icon: LayoutDashboard, primary: true },
  { labelKey: "nav.matches", to: "/matches", icon: ListOrdered },
  { labelKey: "nav.performance", to: "/performance", icon: Gauge },
  { labelKey: "nav.evolution", to: "/evolution", icon: TrendingUp },
  { labelKey: "nav.moments", to: "/moments", icon: Bookmark },
  { labelKey: "nav.playerDna", to: "/player-dna", icon: Dna },
  { labelKey: "nav.maps", to: "/maps", icon: MapPinned },
  { labelKey: "nav.deaths", to: "/deaths", icon: Skull },
  { labelKey: "nav.replay", to: "/replay", icon: Film },
  { labelKey: "nav.combat", to: "/duels", icon: Crosshair },
  { labelKey: "nav.utility", to: "/utility", icon: Bomb },
  { labelKey: "nav.rounds", to: "/rounds", icon: Coins },
  { labelKey: "nav.analysis", to: "/analysis", icon: Stethoscope, primary: true },
  { labelKey: "nav.training", to: "/training", icon: Target, primary: true },
  { labelKey: "nav.goals", to: "/goals", icon: Flag },
  { labelKey: "nav.coach", to: "/coach", icon: Bot, primary: true },
  { labelKey: "nav.profile", to: "/profile", icon: User },
];

export const uploadNavItem: NavItem = { labelKey: "nav.analyze", to: "/upload", icon: Upload };

/**
 * UX-1.5 / R-08 — five areas (Doc. 2 §1). Every current page belongs to one area; an area with
 * several pages shows them as sections (sidebar on desktop, a section bar on top of the page on
 * mobile), so every page is at most two taps away. The per-match pages are tabs of the Match
 * Room (`/matches/$matchId`); their old routes redirect there when a match is given.
 */
export interface NavArea {
  id: "home" | "matches" | "game" | "training" | "coach";
  labelKey: TranslationKey;
  to: string;
  icon: typeof LayoutDashboard;
  /** Sections shown inside the area (absent = the area is one page). */
  sections?: NavItem[];
  /** Path prefixes that belong to the area (for the active state). */
  paths: string[];
}

const item = (to: string): NavItem => {
  const found = navItems.find((i) => i.to === to);
  if (!found) throw new Error(`navigation: unknown item ${to}`);
  return found;
};

export const navAreas: NavArea[] = [
  {
    id: "home",
    labelKey: "nav.area.home",
    to: "/dashboard",
    icon: LayoutDashboard,
    paths: ["/dashboard", "/notifications"],
  },
  {
    id: "matches",
    labelKey: "nav.area.matches",
    to: "/matches",
    icon: ListOrdered,
    sections: [item("/matches"), item("/moments")],
    paths: ["/matches", "/moments", "/rounds", "/deaths", "/duels", "/utility", "/replay"],
  },
  {
    id: "game",
    labelKey: "nav.area.game",
    to: "/analysis",
    icon: Stethoscope,
    sections: [
      item("/analysis"),
      item("/player-dna"),
      item("/performance"),
      item("/evolution"),
      item("/maps"),
    ],
    paths: ["/analysis", "/player-dna", "/performance", "/evolution", "/maps"],
  },
  {
    id: "training",
    labelKey: "nav.area.training",
    to: "/training",
    icon: Target,
    sections: [item("/training"), item("/goals")],
    paths: ["/training", "/goals"],
  },
  { id: "coach", labelKey: "nav.area.coach", to: "/coach", icon: Bot, paths: ["/coach"] },
];

/** The area a path belongs to (null for account pages such as /profile or /upload). */
export function areaOf(pathname: string): NavArea | null {
  return (
    navAreas.find((a) => a.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) ??
    null
  );
}
