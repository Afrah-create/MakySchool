"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { feesBasePath } from "@/lib/fees/types";

/** Resolve fee section URLs from the current portal route (not auth loading state). */
export function useFeesBasePath() {
  const pathname = usePathname();
  const { state } = useAuth();

  if (pathname.startsWith("/bursar")) {
    return "/bursar";
  }
  if (pathname.startsWith("/dashboard/fees")) {
    return "/dashboard/fees";
  }
  if (pathname.startsWith("/dashboard/settings")) {
    return "/dashboard/fees";
  }

  return feesBasePath(state.user?.role ?? "admin");
}

export function useFeesPortal(): "admin" | "bursar" {
  const pathname = usePathname();
  return pathname.startsWith("/bursar") ? "bursar" : "admin";
}
