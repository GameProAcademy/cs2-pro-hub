import {
  Activity,
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

export interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  /** Shown in the mobile bottom navigation. */
  primary?: boolean;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, primary: true },
  { label: "Minhas Partidas", to: "/matches", icon: ListOrdered, primary: true },
  { label: "Performance", to: "/performance", icon: Gauge },
  { label: "Player DNA", to: "/player-dna", icon: Dna },
  { label: "Meu Raio-X", to: "/analysis", icon: Stethoscope, primary: true },
  { label: "Meu Treinamento", to: "/training", icon: Target },
  { label: "AI Coach", to: "/coach", icon: Bot, primary: true },
  { label: "Perfil", to: "/profile", icon: User },
];

export const uploadNavItem: NavItem = { label: "Enviar Demo", to: "/upload", icon: Upload };
export const brandIcon = Activity;
