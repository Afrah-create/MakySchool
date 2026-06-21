import type { SWRConfiguration } from "swr";

export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  dedupingInterval: 5000,
  errorRetryCount: 2,
  shouldRetryOnError: true,
  keepPreviousData: true,
};
