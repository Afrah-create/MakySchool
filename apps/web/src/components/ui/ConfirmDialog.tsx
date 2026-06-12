"use client";

import type { ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-theme-overlay px-4">
      <div className="w-full max-w-lg rounded-3xl border border-theme bg-theme-surface p-6 shadow-theme-panel">
        <h3 className="text-lg font-semibold text-theme-primary">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-theme-muted">{description}</p>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="ms-btn-ghost rounded-xl px-4 py-2">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="ms-btn-primary rounded-xl px-4 py-2">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
