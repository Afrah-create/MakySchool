import { apiClient } from "@/lib/api/client";

export async function apiPathFetcher<T>(path: string): Promise<T> {
  const response = await apiClient<T>(path);
  return response.data;
}
