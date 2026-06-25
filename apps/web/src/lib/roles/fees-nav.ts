/** True when the pathname is under school-admin fees routes. */
export function isFeesPath(pathname: string) {
  return pathname === "/dashboard/fees" || pathname.startsWith("/dashboard/fees/");
}
