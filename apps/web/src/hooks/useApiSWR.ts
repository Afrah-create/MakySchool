"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { useDelayedTrue } from "@/hooks/useDelayedTrue";
import { apiPathFetcher } from "@/lib/swr/fetcher";

export function useApiSWR<T>(path: string | null, config?: SWRConfiguration<T>) {
  const result = useSWR<T>(path, path ? apiPathFetcher<T> : null, config);
  const isSlow = useDelayedTrue(result.isLoading && result.data === undefined, 4000);

  return { ...result, isSlow };
}
