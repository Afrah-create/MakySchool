"use client";

import Link from "next/link";
import { can } from "@makyschool/shared/constants";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useAuth } from "@/providers/AuthProvider";
import type { RolloverSession } from "@makyschool/shared/types";

export function RolloverResumeBanner() {
  const { state } = useAuth();
  const allowed = state.user?.role ? can(state.user.role, "manageAcademicYear") : false;
  const { data } = useSchoolSWR<RolloverSession[]>(
    allowed ? "/schools/rollover/sessions" : null,
  );

  if (!allowed || !data?.length) return null;

  const tracks = data.map((s) => (s.track === "primary" ? "Primary" : "Secondary")).join(" & ");

  return (
    <div className="space-y-2">
      <StatusBanner
        tone="info"
        message={`Year rollover in progress (${tracks}). Resume from Settings → Year rollover. Nothing is committed until you confirm.`}
      />
      <Link
        href="/dashboard/settings/year-rollover"
        className="inline-flex text-sm font-medium text-theme-primary underline"
      >
        Resume rollover
      </Link>
    </div>
  );
}
