"use client";

import { useState } from "react";
import { UserCheck } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import type { TeacherListItem } from "@/lib/teachers/types";
import { useToast } from "@/providers/ToastProvider";

export function ReactivateDialog({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: TeacherListItem | null;
  onClose: () => void;
  onSaved: (teacher: TeacherListItem) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!teacher) return null;

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await apiClient(`/schools/teachers/${teacher!.id}/reactivate`, { method: "PATCH" });
      toast.success(`${teacher!.full_name}'s account has been reactivated.`, 4000);
      onSaved({ ...teacher!, is_active: true });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reactivate teacher.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-theme-overlay" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-theme bg-theme-surface p-6 shadow-theme-panel">
        <UserCheck className="mx-auto h-8 w-8 text-theme-success" />
        <h2 className="mt-4 text-center text-lg font-semibold text-theme-primary">
          Reactivate {teacher.full_name}?
        </h2>
        <p className="mt-2 text-center text-sm text-theme-muted">
          They will be able to log in again immediately.
        </p>
        {error ? <p className="mt-3 text-center text-sm text-theme-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="ms-btn-secondary" disabled={loading} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ms-btn-primary" disabled={loading} onClick={() => void handleConfirm()}>
            {loading ? "Reactivating…" : "Reactivate account"}
          </button>
        </div>
      </div>
    </div>
  );
}
