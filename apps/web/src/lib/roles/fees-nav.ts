/** True when the pathname is under school-admin fees routes. */
export function isFeesPath(pathname: string) {
  return pathname === "/dashboard/fees" || pathname.startsWith("/dashboard/fees/");
}

/** True when the pathname is under bursar fees routes. */
export function isBursarFeesPath(pathname: string) {
  return pathname === "/bursar/dashboard" || pathname.startsWith("/bursar/");
}
