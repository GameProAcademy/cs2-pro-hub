import {
  Bot,
  Dna,
  Gauge,
  LayoutDashboard,
  ListOrdered,
  Stethoscope,
  Target,
  Upload,
  User,
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
  { labelKey: "nav.playerDna", to: "/player-dna", icon: Dna },
  { labelKey: "nav.analysis", to: "/analysis", icon: Stethoscope, primary: true },
  { labelKey: "nav.training", to: "/training", icon: Target, primary: true },
  { labelKey: "nav.coach", to: "/coach", icon: Bot, primary: true },
  { labelKey: "nav.profile", to: "/profile", icon: User },
];

export const uploadNavItem: NavItem = { labelKey: "nav.analyze", to: "/upload", icon: Upload };
