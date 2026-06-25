import {
  PLATFORM_SESSION_CHANNEL,
  type SessionLogoutReason,
} from "@makyschool/shared/constants";
import { createSessionBroadcast } from "@makyschool/shared/session";

const broadcast = createSessionBroadcast(PLATFORM_SESSION_CHANNEL);

export function broadcastActivity(at: number) {
  broadcast.broadcastActivity(at);
}

export function broadcastLogout(reason: SessionLogoutReason) {
  broadcast.broadcastLogout(reason);
}

export function subscribeSessionEvents(handler: Parameters<typeof broadcast.subscribe>[0]) {
  return broadcast.subscribe(handler);
}
