import { apiClient } from "./client";
import type { Notification, NotificationPreference, NotificationsResponse } from "@makyschool/shared/types";

export async function getNotifications(params?: {
  limit?: number;
  offset?: number;
  is_read?: boolean;
  is_archived?: boolean;
  type?: string;
}) {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  if (params?.is_read != null) search.set("is_read", String(params.is_read));
  if (params?.is_archived != null) search.set("is_archived", String(params.is_archived));
  if (params?.type) search.set("type", params.type);

  const query = search.toString();
  const path = query ? `/api/schools/notifications?${query}` : "/api/schools/notifications";
  const response = await apiClient<NotificationsResponse>(path);
  return response.data;
}

export async function getUnreadCount() {
  const response = await apiClient<{ count: number }>('/api/schools/notifications/unread-count');
  return response.data;
}

export async function markAsRead(id: string) {
  const response = await apiClient<Notification>(`/api/schools/notifications/${id}/read`, {
    method: "PATCH",
  });
  return response.data;
}

export async function markAllAsRead() {
  const response = await apiClient<{ updated: number }>('/api/schools/notifications/read-all', {
    method: "PATCH",
  });
  return response.data;
}

export async function archiveNotification(id: string) {
  const response = await apiClient<Notification>(`/api/schools/notifications/${id}/archive`, {
    method: "PATCH",
  });
  return response.data;
}

export async function archiveAllRead() {
  const response = await apiClient<{ archived: number }>('/api/schools/notifications/archive-read', {
    method: "PATCH",
  });
  return response.data;
}

export async function deleteNotification(id: string) {
  const response = await apiClient<{ deleted: boolean }>(`/api/schools/notifications/${id}`, {
    method: "DELETE",
  });
  return response.data;
}

export async function getPreferences() {
  const response = await apiClient<{ preferences: NotificationPreference[] }>('/api/schools/notifications/preferences');
  return response.data;
}

export async function updatePreferences(preferences: Array<{ type: string; in_app_enabled: boolean }>) {
  const response = await apiClient<{ updated: number }>('/api/schools/notifications/preferences', {
    method: "PATCH",
    body: { preferences },
  });
  return response.data;
}

export function createNotificationSSEConnection(
  onEvent: (event: string, data: Record<string, unknown>) => void,
) {
  const url = "/api/schools/notifications/stream";
  const source = new EventSource(url, { withCredentials: true });

  source.addEventListener("connected", (event) => {
    try {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      onEvent("connected", payload);
    } catch {
      onEvent("connected", {});
    }
  });

  source.addEventListener("notification", (event) => {
    try {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      onEvent("notification", payload);
    } catch {
      onEvent("notification", {});
    }
  });

  source.addEventListener("unread_count", (event) => {
    try {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      onEvent("unread_count", payload);
    } catch {
      onEvent("unread_count", {});
    }
  });

  source.addEventListener("ping", (event) => {
    try {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      onEvent("ping", payload);
    } catch {
      onEvent("ping", {});
    }
  });

  source.onerror = () => {
    onEvent("error", {});
  };

  return () => {
    source.close();
  };
}
