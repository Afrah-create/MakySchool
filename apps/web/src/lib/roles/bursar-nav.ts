import {
  AlertCircle,
  CircleDollarSign,
  FileText,
  History,
  LayoutDashboard,
  ListOrdered,
  PlusCircle,
  Receipt,
  Wallet,
} from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";
import type { PortalNavGroup, PortalNavItem } from "./portal-nav";

const bursarRole = [USER_ROLES.BURSAR] as const;

const bursarFeesNavChildren: PortalNavItem[] = [
  {
    id: "bursar-structures",
    label: "Fee structures",
    href: "/bursar/structures",
    icon: ListOrdered,
    exact: false,
    roles: bursarRole,
  },
  {
    id: "bursar-payments-new",
    label: "Record payment",
    href: "/bursar/payments/new",
    icon: PlusCircle,
    exact: false,
    roles: bursarRole,
  },
  {
    id: "bursar-payments",
    label: "Payment history",
    href: "/bursar/payments",
    icon: History,
    exact: false,
    roles: bursarRole,
  },
  {
    id: "bursar-outstanding",
    label: "Outstanding",
    href: "/bursar/outstanding",
    icon: AlertCircle,
    exact: false,
    roles: bursarRole,
  },
  {
    id: "bursar-invoices",
    label: "Invoices",
    href: "/bursar/invoices",
    icon: Receipt,
    exact: false,
    roles: bursarRole,
  },
  {
    id: "bursar-other-income",
    label: "Other income",
    href: "/bursar/other-income",
    icon: Wallet,
    exact: false,
    roles: bursarRole,
  },
  {
    id: "bursar-reports",
    label: "Reports",
    href: "/bursar/reports",
    icon: FileText,
    exact: false,
    roles: bursarRole,
  },
];

export const bursarNavGroups: PortalNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      {
        id: "bursar-home",
        href: "/bursar/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
        roles: bursarRole,
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: CircleDollarSign,
    items: [
      {
        id: "bursar-fees",
        label: "Fees",
        href: "/bursar/dashboard",
        icon: Receipt,
        exact: false,
        roles: bursarRole,
        children: bursarFeesNavChildren,
      },
    ],
  },
];

/** @deprecated Use bursarNavGroups */
export const bursarNav: PortalNavItem[] = bursarNavGroups.flatMap((group) => group.items);
