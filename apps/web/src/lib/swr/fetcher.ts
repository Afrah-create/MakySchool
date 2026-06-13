import { apiClient } from "@/lib/api/client";

export type TenantSWRKey = readonly [path: string, schoolSlug: string];

export async function tenantFetcher<T>(key: TenantSWRKey): Promise<T> {
  const [path, schoolSlug] = key;
  const response = await apiClient<T>(path, { schoolSlug });
  return response.data;
}

export async function apiPathFetcher<T>(path: string): Promise<T> {
  const response = await apiClient<T>(path);
  return response.data;
}
