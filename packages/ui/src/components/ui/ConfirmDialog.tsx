"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LoadingButton } from "./LoadingButton";

type ConfirmDialogVariant = "default" | "danger" | "blocked";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  requiresText,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  loading?: boolean;
  /** When set, user must type this exact string to enable confirm. */
  requiresText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const [typedText, setTypedText] = useState("");

  useEffect(() => {
    if (!open) {
      setTypedText("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) {
    return null;
  }

  const isBlocked = variant === "blocked";
  const textRequired = Boolean(requiresText?.trim());
  const textMatches = !textRequired || typedText === requiresText;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-theme-overlay px-4"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-theme bg-theme-surface p-6 shadow-theme-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="text-lg font-semibold text-theme-primary">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-theme-muted">{description}</p>
        {children ? <div className="mt-4">{children}</div> : null}
        {textRequired ? (
          <label className="mt-4 block">
            <span className="mb-1 block text-xs text-theme-muted">
              Type <span className="font-mono font-medium text-theme-primary">{requiresText}</span> to confirm
            </span>
            <input
              className="ms-input w-full"
              value={typedText}
              onChange={(event) => setTypedText(event.target.value)}
              autoComplete="off"
            />
          </label>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="ms-btn-ghost rounded-xl px-4 py-2"
          >
            {isBlocked ? "Close" : cancelLabel}
          </button>
          {!isBlocked ? (
            <LoadingButton
              variant={variant === "danger" ? "danger" : "primary"}
              loading={loading}
              loadingLabel="Please wait…"
              disabled={!textMatches}
              onClick={() => void onConfirm?.()}
              className="rounded-xl px-4 py-2"
            >
              {confirmLabel}
            </LoadingButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
