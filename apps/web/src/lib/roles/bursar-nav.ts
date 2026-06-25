import {
  AlertCircle,
  FileText,
  History,
  LayoutDashboard,
  ListOrdered,
  PlusCircle,
  Receipt,
  Wallet,
} from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";
import type { PortalNavItem } from "./portal-nav";

export const bursarNav: PortalNavItem[] = [
  {
    id: "bursar-dashboard",
    label: "Dashboard",
    href: "/bursar/dashboard",
    icon: LayoutDashboard,
    exact: true,
    roles: [USER_ROLES.BURSAR],
  },
  {
    id: "bursar-structures",
    label: "Fee Structures",
    href: "/bursar/structures",
    icon: ListOrdered,
    exact: false,
    roles: [USER_ROLES.BURSAR],
  },
  {
    id: "bursar-payments-new",
    label: "Record Payment",
    href: "/bursar/payments/new",
    icon: PlusCircle,
    exact: false,
    roles: [USER_ROLES.BURSAR],
  },
  {
    id: "bursar-payments",
    label: "Payment History",
    href: "/bursar/payments",
    icon: History,
    exact: false,
    roles: [USER_ROLES.BURSAR],
  },
  {
    id: "bursar-invoices",
    label: "Invoices",
    href: "/bursar/invoices",
    icon: Receipt,
    exact: false,
    roles: [USER_ROLES.BURSAR],
  },
  {
    id: "bursar-other-income",
    label: "Other Income",
    href: "/bursar/other-income",
    icon: Wallet,
    exact: false,
    roles: [USER_ROLES.BURSAR],
  },
  {
    id: "bursar-outstanding",
    label: "Outstanding Fees",
    href: "/bursar/outstanding",
    icon: AlertCircle,
    exact: false,
    roles: [USER_ROLES.BURSAR],
  },
  {
    id: "bursar-reports",
    label: "Reports",
    href: "/bursar/reports",
    icon: FileText,
    exact: false,
    roles: [USER_ROLES.BURSAR],
  },
];
