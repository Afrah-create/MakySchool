import type { LucideIcon } from "lucide-react";
import { School, Settings, Shield } from "lucide-react";

export type PlatformNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

export const platformAdminNav: PlatformNavItem[] = [
  {
    href: "/dashboard",
    label: "Schools",
    icon: School,
    isActive: (pathname) => pathname === "/dashboard" || pathname.startsWith("/schools"),
  },
  {
    href: "/admins",
    label: "Platform admins",
    icon: Shield,
    isActive: (pathname) => pathname === "/admins" || pathname.startsWith("/admins/"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    isActive: (pathname) => pathname === "/settings" || pathname.startsWith("/settings/"),
  },
];
