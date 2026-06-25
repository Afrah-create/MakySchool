"use client";

import { useState } from "react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { formatClassLabel } from "@makyschool/shared/constants";
import { useApiSWR } from "@/hooks/useApiSWR";
import { apiClient } from "@/lib/api/client";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import type { FeeStructure } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

type ClassOption = { id: string; level: string; stream: string | null };

export function AddFeeStructurePanel({
  open,
  onClose,
  onSaved,
  onAssign,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onAssign?: (structure: FeeStructure) => void;
}) {
  const { toast } = useToast();
  const { data: classes } = useApiSWR<ClassOption[]>(open ? "/schools/classes" : null);
  const [classId, setClassId] = useState("");
  const [termName, setTermName] = useState("Term 1");
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<FeeStructure | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient<FeeStructure>("/schools/fees/structures", {
        method: "POST",
        body: {
          class_id: classId,
          term_name: termName.trim(),
          academic_year: academicYear,
          amount,
          description: description.trim() || undefined,
        },
      });
      setCreated(response.data);
      toast.success(`Fee structure created for ${formatUGX(amount)}.`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fee structure.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setCreated(null);
        onClose();
      }}
      size="lg"
      title="Add fee structure"
      description="Set the expected fee amount for a class and term."
      footer={
        created ? (
          <div className="flex gap-2">
            <button type="button" className="ms-btn-secondary flex-1" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="ms-btn-primary flex-1"
              onClick={() => onAssign?.(created)}
            >
              Assign to class
            </button>
          </div>
        ) : (
          <button type="submit" form="add-fee-structure-form" disabled={loading} className="ms-btn-primary w-full">
            {loading ? "Creating…" : "Create fee structure"}
          </button>
        )
      }
    >
      {created ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium text-theme-primary">Fee structure created</p>
          <p className="text-theme-muted">
            {created.class_name} · {created.term_name} · {formatUGX(Number(created.amount))}
          </p>
          <p className="text-theme-muted">Assign it to active students in the class to start collecting fees.</p>
        </div>
      ) : (
        <form id="add-fee-structure-form" onSubmit={(e) => void submit(e)} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Class *</span>
            <select className="ms-input w-full" value={classId} onChange={(e) => setClassId(e.target.value)} required>
              <option value="">Select class</option>
              {(classes ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {formatClassLabel(item.level, item.stream)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Term name *</span>
            <input className="ms-input w-full" value={termName} onChange={(e) => setTermName(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Academic year *</span>
            <input
              type="number"
              className="ms-input w-full"
              value={academicYear}
              onChange={(e) => setAcademicYear(Number(e.target.value))}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Amount (UGX) *</span>
            <div className="flex overflow-hidden rounded-xl border border-theme">
              <span className="flex items-center bg-theme-surface-raised px-3 text-sm text-theme-muted">UGX</span>
              <input
                className="ms-input w-full border-0"
                value={formatUGXInput(amount)}
                onChange={(e) => setAmount(parseUGXInput(e.target.value))}
                required
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Description</span>
            <textarea className="ms-input w-full" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {error ? <p className="text-sm text-theme-danger">{error}</p> : null}
        </form>
      )}
    </Modal>
  );
}
