import {
  BarChart3,
  FileCheck2,
  FileClock,
  LayoutDashboard,
  type LucideIcon,
  Package,
  PhoneCall,
  Settings,
  ShoppingBag,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/pos", label: "POS", icon: ShoppingBag },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/invoices", label: "Invoices", icon: FileCheck2 },
      { href: "/proformas", label: "Proformas", icon: FileClock },
    ],
  },
  {
    label: "Relationships",
    items: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/followups", label: "Follow-ups", icon: PhoneCall },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function titleForPath(pathname: string): string {
  for (const s of NAV) for (const i of s.items) if (pathname === i.href || pathname.startsWith(i.href + "/")) return i.label;
  return "Organo Healers";
}
