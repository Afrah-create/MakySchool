"use client";

import { useState } from "react";
import { UserX } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import type { TeacherListItem } from "@/lib/teachers/types";
import { useToast } from "@/providers/ToastProvider";

export function DeactivateDialog({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: TeacherListItem | null;
  onClose: () => void;
  onSaved: (teacher: TeacherListItem) => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!teacher) return null;

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await apiClient(`/schools/teachers/${teacher!.id}/deactivate`, {
        method: "PATCH",
        body: { reason: reason.trim() || undefined },
      });
      toast.warning(`${teacher!.full_name}'s account has been deactivated.`, 4000);
      onSaved({ ...teacher!, is_active: false });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate teacher.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-theme-overlay" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-theme bg-theme-surface p-6 shadow-theme-panel">
        <UserX className="mx-auto h-8 w-8 text-theme-danger" />
        <h2 className="mt-4 text-center text-lg font-semibold text-theme-primary">
          Deactivate {teacher.full_name}?
        </h2>
        <p className="mt-2 text-center text-sm text-theme-muted">
          They will not be able to log in until you reactivate their account. Their data and class history are preserved.
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-theme-muted">Reason (optional)</span>
          <textarea
            className="ms-input min-h-24"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for deactivation (optional) — e.g. Teacher left the school"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-theme-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="ms-btn-secondary" disabled={loading} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleConfirm()}
            className="rounded-lg border border-theme bg-theme-danger-bg px-4 py-2 text-sm font-medium text-theme-danger hover:opacity-90"
          >
            {loading ? "Deactivating…" : "Deactivate account"}
          </button>
        </div>
      </div>
    </div>
  );
}
