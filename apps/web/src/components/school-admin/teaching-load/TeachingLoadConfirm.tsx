"use client";

import { AlertTriangle } from "lucide-react";
import type { AssignmentSyncPreview } from "@makyschool/shared/types";

export function TeachingLoadConfirm({
  preview,
  onCancel,
  onConfirm,
  loading,
}: {
  preview: AssignmentSyncPreview;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const blocks = preview.blocks ?? [];
  const warnings = preview.warnings ?? [];

  return (
    <div className="rounded-xl border border-theme bg-theme-surface-raised p-4 text-sm">
      <p className="font-medium text-theme-primary">Confirm teaching load changes</p>

      {warnings.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1 text-xs text-amber-900 dark:text-amber-100">
              {warnings.map((warning) => (
                <p key={`${warning.class_id}-${warning.message}`}>{warning.message}</p>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {blocks.length > 0 ? (
        <div className="mt-4 rounded-lg border border-theme-danger/30 bg-theme-danger-bg p-3 text-xs text-theme-danger">
          {blocks.map((block) => (
            <p key={block.class_id}>{block.reason}</p>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-xs text-theme-muted">
        Removing a teacher from a class revokes their portal access for that class. Historical
        marks records are kept for audit purposes.
      </p>

      <div className="mt-4 flex gap-2">
        <button type="button" className="ms-btn-secondary flex-1" disabled={loading} onClick={onCancel}>
          Go back
        </button>
        <button
          type="button"
          className="ms-btn-primary flex-1"
          disabled={blocks.length > 0 || loading}
          onClick={onConfirm}
        >
          {loading ? "Saving…" : "Confirm and save"}
        </button>
      </div>
    </div>
  );
}
