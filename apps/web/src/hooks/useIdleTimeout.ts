"use client";

import { useEffect, useRef, useState } from "react";
import {
  SESSION_ACTIVITY_THROTTLE_MS,
  SESSION_AUTH_PING_INTERVAL_MS,
  SESSION_IDLE_CHECK_INTERVAL_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_AT_MS,
  SESSION_WARNING_LEAD_MS,
  TENANT_SESSION_CHANNEL,
  type SessionLogoutReason,
} from "@makyschool/shared/constants";
import { throttle, isActivityIdleExpired, readStoredActivity } from "@makyschool/shared/session";
import { checkAuthOrRedirect } from "@/lib/auth/check-session";
import { performLogout } from "@/lib/auth/logout";
import { broadcastActivity, subscribeSessionEvents } from "@/lib/auth/session-broadcast";
import { resolveClientApiUrl } from "@/lib/api/base-url";
import { readStoredSchoolSlug } from "@/lib/auth/session";

async function refreshSession() {
  const schoolSlug = readStoredSchoolSlug() ?? document.body.dataset.schoolSlug;
  const headers: HeadersInit = {
    "x-makyschool-client-app": "tenant",
  };
  if (schoolSlug) {
    headers["x-school-slug"] = schoolSlug;
  }

  const response = await fetch(resolveClientApiUrl("/auth/refresh"), {
    method: "POST",
    credentials: "include",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Session refresh failed");
  }
}

export function useIdleTimeout() {
  const lastActivityRef = useRef(0);
  const warningVisibleRef = useRef(false);
  const [warningVisible, setWarningVisible] = useState(false);
  const [countdownTick, setCountdownTick] = useState(0);

  const warningRemainingMs = warningVisible
    ? Math.max(0, SESSION_IDLE_TIMEOUT_MS - (Date.now() - lastActivityRef.current))
    : SESSION_WARNING_LEAD_MS;

  const recordActivity = (at = Date.now()) => {
    lastActivityRef.current = at;
    broadcastActivity(at);
    if (warningVisibleRef.current) {
      warningVisibleRef.current = false;
      setWarningVisible(false);
      void refreshSession().catch(() => performLogout("expired"));
    }
  };

  const stayLoggedIn = async () => {
    recordActivity();
    try {
      await refreshSession();
    } catch {
      await performLogout("expired");
    }
  };

  const logoutNow = async (reason: SessionLogoutReason = "manual") => {
    await performLogout(reason);
  };

  useEffect(() => {
    if (!warningVisible) {
      return;
    }
    const countdownTimer = window.setInterval(() => {
      setCountdownTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(countdownTimer);
  }, [warningVisible, countdownTick]);

  useEffect(() => {
    const initialActivity = readStoredActivity(TENANT_SESSION_CHANNEL) ?? Date.now();
    lastActivityRef.current = initialActivity;

    if (isActivityIdleExpired(initialActivity)) {
      void performLogout("idle");
      return;
    }

    const onActivity = throttle(() => recordActivity(), SESSION_ACTIVITY_THROTTLE_MS);
    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];

    for (const eventName of events) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    const unsubscribe = subscribeSessionEvents((message) => {
      if (message.type === "activity") {
        lastActivityRef.current = Math.max(lastActivityRef.current, message.at);
        if (warningVisibleRef.current) {
          warningVisibleRef.current = false;
          setWarningVisible(false);
        }
        return;
      }
      void performLogout(message.reason);
    });

    const idleTimer = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;

      if (idleMs >= SESSION_IDLE_TIMEOUT_MS) {
        void performLogout("idle");
        return;
      }

      if (idleMs >= SESSION_WARNING_AT_MS) {
        warningVisibleRef.current = true;
        setWarningVisible(true);
        return;
      }

      if (warningVisibleRef.current) {
        warningVisibleRef.current = false;
        setWarningVisible(false);
      }
    }, SESSION_IDLE_CHECK_INTERVAL_MS);

    const authPing = window.setInterval(() => {
      void checkAuthOrRedirect();
    }, SESSION_AUTH_PING_INTERVAL_MS);

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void checkAuthOrRedirect();
      }
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, onActivity);
      }
      unsubscribe();
      window.clearInterval(idleTimer);
      window.clearInterval(authPing);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return {
    warningVisible,
    warningRemainingMs,
    stayLoggedIn,
    logoutNow,
    recordActivity,
  };
}
