import type { PermissionAction } from "@makyschool/shared/constants";

/** Permission required for the dashboard top-bar primary action on a route. */
export function primaryActionPermission(pathname: string): PermissionAction | null {
  if (pathname.startsWith("/dashboard/teaching-load")) return "manageStaff";
  if (pathname.startsWith("/dashboard/teachers")) return "manageStaff";
  if (pathname.startsWith("/dashboard/students")) return "manageStaff";
  if (pathname.startsWith("/dashboard/users")) return "manageUsers";
  if (
    pathname.startsWith("/dashboard/classes") ||
    pathname.startsWith("/dashboard/subjects")
  ) {
    return "manageClasses";
  }
  if (pathname.startsWith("/dashboard/timetable")) return "manageTimetable";
  if (pathname.startsWith("/dashboard/fees")) return "manageFees";
  if (pathname === "/dashboard" || pathname === "/dashboard/") return "manageStaff";
  return null;
}
