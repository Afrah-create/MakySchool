const TITLE_BY_PATH: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/menu": "Menu",
  "/dashboard/teachers": "Teachers",
  "/dashboard/students": "Students",
  "/dashboard/users": "Staff accounts",
  "/dashboard/teaching-load": "Teaching load",
  "/dashboard/classes": "Classes",
  "/dashboard/subjects": "Subjects",
  "/dashboard/timetable": "Timetable",
  "/dashboard/fees": "Fees",
  "/dashboard/fees/structures": "Fee structures",
  "/dashboard/fees/payments": "Payments",
  "/dashboard/fees/outstanding": "Outstanding",
  "/dashboard/fees/invoices": "Invoices",
  "/dashboard/fees/other-income": "Other income",
  "/dashboard/fees/budget": "Budget",
  "/dashboard/fees/reports": "Reports",
  "/dashboard/billing": "Billing",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/accounts": "Chart of accounts",
  "/teacher/dashboard": "Dashboard",
  "/teacher/classes": "My classes",
  "/teacher/profile": "My profile",
  "/learner/dashboard": "Dashboard",
  "/learner/timetable": "Timetable",
  "/bursar/dashboard": "Dashboard",
  "/bursar/menu": "Menu",
  "/bursar/structures": "Fee structures",
  "/bursar/payments/new": "Record payment",
  "/bursar/payments": "Payment history",
  "/bursar/outstanding": "Outstanding",
  "/bursar/invoices": "Invoices",
  "/bursar/other-income": "Other income",
  "/bursar/reports": "Reports",
  "/bursar/budget": "Budget",
};

export function resolveMobilePageTitle(pathname: string): string {
  if (TITLE_BY_PATH[pathname]) {
    return TITLE_BY_PATH[pathname];
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "Dashboard";
  }

  const last = segments[segments.length - 1];
  if (last === "new") {
    return "New";
  }

  return last
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
