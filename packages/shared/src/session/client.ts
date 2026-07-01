import {
  SESSION_IDLE_TIMEOUT_MS,
  type SessionBroadcastMessage,
  type SessionLogoutReason,
} from "@makyschool/shared/constants";

export function readStoredActivity(channelName: string): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = localStorage.getItem(`${channelName}:activity`);
    if (!stored) {
      return null;
    }
    const at = Number(stored);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

export function isActivityIdleExpired(lastActivity: number | null, now = Date.now()) {
  if (lastActivity === null) {
    return false;
  }
  return now - lastActivity >= SESSION_IDLE_TIMEOUT_MS;
}

export function clearStoredActivity(channelName: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(`${channelName}:activity`);
  } catch {
    // ignore
  }
}

export function createSessionBroadcast(channelName: string) {
  let channel: BroadcastChannel | null = null;

  function getChannel() {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return null;
    }
    if (!channel) {
      channel = new BroadcastChannel(channelName);
    }
    return channel;
  }

  function broadcastActivity(at: number) {
    const message: SessionBroadcastMessage = { type: "activity", at };
    getChannel()?.postMessage(message);
    try {
      localStorage.setItem(`${channelName}:activity`, String(at));
    } catch {
      // ignore quota / privacy mode
    }
  }

  function broadcastLogout(reason: SessionLogoutReason) {
    const message: SessionBroadcastMessage = { type: "logout", reason };
    getChannel()?.postMessage(message);
    try {
      clearStoredActivity(channelName);
      localStorage.setItem(`${channelName}:logout`, JSON.stringify(message));
      localStorage.removeItem(`${channelName}:logout`);
    } catch {
      // ignore
    }
  }

  function subscribe(handler: (message: SessionBroadcastMessage) => void) {
    const bc = getChannel();
    const onMessage = (event: MessageEvent<SessionBroadcastMessage>) => {
      handler(event.data);
    };
    bc?.addEventListener("message", onMessage);

    const onStorage = (event: StorageEvent) => {
      if (!event.key?.startsWith(channelName)) return;
      if (event.key === `${channelName}:activity` && event.newValue) {
        handler({ type: "activity", at: Number(event.newValue) });
        return;
      }
      if (event.key === `${channelName}:logout` && event.newValue) {
        try {
          handler(JSON.parse(event.newValue) as SessionBroadcastMessage);
        } catch {
          handler({ type: "logout", reason: "expired" });
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      bc?.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }

  return { broadcastActivity, broadcastLogout, subscribe };
}

export function throttle<T extends (...args: never[]) => void>(fn: T, waitMs: number): T {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = ((...args: never[]) => {
    const now = Date.now();
    const remaining = waitMs - (now - lastCall);

    if (remaining <= 0) {
      lastCall = now;
      fn(...args);
      return;
    }

    if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
  }) as T;

  return throttled;
}

export function formatCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
