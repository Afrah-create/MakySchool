"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { tenantFetcher } from "@/lib/swr/fetcher";
import { useSchool } from "@/providers/SchoolProvider";

export function useSchoolSWR<T>(path: string | null, config?: SWRConfiguration<T>) {
  const { schoolSlug } = useSchool();
  const key = path ? ([path, schoolSlug] as const) : null;

  return useSWR<T>(key, tenantFetcher<T>, config);
}

/** @deprecated Use useSchoolSWR */
export const useTenantSWR = useSchoolSWR;
