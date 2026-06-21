"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { useDelayedTrue } from "@makyschool/ui/hooks/useDelayedTrue";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";
import { tenantFetcher, type TenantSWRKey } from "@/lib/swr/fetcher";

export function useTenantSWR<T>(path: string | null, config?: SWRConfiguration<T>) {
  const { schoolSlug } = useTenantSchool();
  const key: TenantSWRKey | null = path && schoolSlug ? [path, schoolSlug] : null;

  const result = useSWR<T>(key, tenantFetcher<T>, config);
  const isSlow = useDelayedTrue(result.isLoading && result.data === undefined, 4000);

  return { ...result, isSlow };
}
