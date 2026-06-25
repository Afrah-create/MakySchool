"use client";

import { SessionTimeoutWarning } from "@/components/session/SessionTimeoutWarning";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

export function SessionManager() {
  const { warningVisible, warningRemainingMs, stayLoggedIn, logoutNow } = useIdleTimeout();

  return (
    <SessionTimeoutWarning
      open={warningVisible}
      remainingMs={warningRemainingMs}
      onStayLoggedIn={() => void stayLoggedIn()}
      onLogoutNow={() => void logoutNow("manual")}
    />
  );
}
