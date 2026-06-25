"use client";

import { formatCountdown } from "@makyschool/shared/session";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { Modal } from "@makyschool/ui/components/ui/Modal";

type SessionTimeoutWarningProps = {
  open: boolean;
  remainingMs: number;
  onStayLoggedIn: () => void;
  onLogoutNow: () => void;
};

export function SessionTimeoutWarning({
  open,
  remainingMs,
  onStayLoggedIn,
  onLogoutNow,
}: SessionTimeoutWarningProps) {
  return (
    <Modal
      open={open}
      onClose={onStayLoggedIn}
      title="Session expiring soon"
      description="You will be signed out soon due to inactivity. Stay signed in to continue where you left off."
      size="sm"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <LoadingButton type="button" variant="ghost" onClick={onLogoutNow}>
            Log out now
          </LoadingButton>
          <LoadingButton type="button" onClick={onStayLoggedIn}>
            Stay logged in
          </LoadingButton>
        </div>
      }
    >
      <div className="rounded-xl border border-theme bg-theme-surface px-4 py-5 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
          Time remaining
        </p>
        <p className="mt-2 font-mono text-3xl font-semibold text-theme-primary">
          {formatCountdown(remainingMs)}
        </p>
      </div>
    </Modal>
  );
}
