"use client";

import { useMemo, useState } from "react";
import { formatClassLabel } from "@makyschool/shared/constants";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { cn } from "@makyschool/ui/lib/cn";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useApiSWR } from "@/hooks/useApiSWR";
import { apiClient } from "@/lib/api/client";
import { fetchActiveStudentIdsForClass } from "@/lib/fees/classStudents";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import type { FeeStructure, InvoiceBulkResult, InvoiceDetail } from "@/lib/fees/types";
import type { ClassOption, StudentsListResponse } from "@/lib/students/types";
import { useToast } from "@/providers/ToastProvider";

type StudentOption = { id: string; full_name: string; learner_id: string; class_name?: string | null };
type LineItem = { description: string; account_id: string; quantity: number; unit_amount: number };

export function AddInvoicePanel({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [classId, setClassId] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [feeStructureId, setFeeStructureId] = useState("");
  const [termName, setTermName] = useState("Term 1");
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "School fees", account_id: "", quantity: 1, unit_amount: 0 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: structures } = useApiSWR<FeeStructure[]>(open ? "/schools/fees/structures" : null);
  const selectedStructure = structures?.find((row) => row.id === feeStructureId);
  const effectiveClassId = classId || selectedStructure?.class_id || "";

  const studentQuery = useMemo(() => {
    if (!open || mode !== "single" || !debouncedSearch.trim()) return null;
    return `/schools/students?search=${encodeURIComponent(debouncedSearch.trim())}&status=active&limit=8`;
  }, [open, mode, debouncedSearch]);

  const { data: searchResults } = useApiSWR<StudentsListResponse>(studentQuery);
  const { data: classes } = useApiSWR<ClassOption[]>(open ? "/schools/classes" : null);

  const classStudentsQuery =
    open && mode === "bulk" && effectiveClassId
      ? `/schools/students?class_id=${effectiveClassId}&status=active&limit=100`
      : null;
  const {
    data: classStudentsData,
    isLoading: classStudentsLoading,
    error: classStudentsError,
  } = useApiSWR<StudentsListResponse>(classStudentsQuery);

  const classStudents = classStudentsData?.students ?? [];
  const classStudentTotal = classStudentsData?.total ?? 0;

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unit_amount, 0),
    [items],
  );

  function reset() {
    setMode("single");
    setSearch("");
    setSelectedStudent(null);
    setClassId("");
    setSelectedStudents(new Set());
    setFeeStructureId("");
    setTermName("Term 1");
    setAcademicYear(new Date().getFullYear());
    setDueDate("");
    setNotes("");
    setItems([{ description: "School fees", account_id: "", quantity: 1, unit_amount: 0 }]);
    setError(null);
  }

  function applyFeeStructure(structureId: string) {
    setFeeStructureId(structureId);
    const structure = structures?.find((row) => row.id === structureId);
    if (!structure) return;
    setClassId(structure.class_id);
    setSelectedStudents(new Set());
    setTermName(structure.term_name);
    setAcademicYear(structure.academic_year);
    setItems([
      {
        description: structure.description?.trim() || `Fees — ${structure.class_name}`,
        account_id: "",
        quantity: 1,
        unit_amount: Number(structure.amount),
      },
    ]);
  }

  function requestClose() {
    reset();
    onClose();
  }

  async function resolveBulkStudentIds(): Promise<string[]> {
    if (selectedStudents.size > 0) {
      return [...selectedStudents];
    }
    if (!effectiveClassId) {
      return [];
    }
    if (classStudents.length > 0 && classStudents.length >= classStudentTotal) {
      return classStudents.map((student) => student.id);
    }
    return fetchActiveStudentIdsForClass(effectiveClassId);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const validItems = items.filter((item) => item.description.trim() && item.unit_amount > 0);
    if (validItems.length === 0) {
      setError("Add at least one line item.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        fee_structure_id: feeStructureId || undefined,
        due_date: dueDate || undefined,
        term_name: termName.trim(),
        academic_year: academicYear,
        notes: notes.trim() || undefined,
        items: validItems.map((item) => ({
          description: item.description.trim(),
          account_id: item.account_id || undefined,
          quantity: item.quantity,
          unit_amount: item.unit_amount,
        })),
      };

      if (mode === "single") {
        if (!selectedStudent) {
          setError("Select a student.");
          setLoading(false);
          return;
        }
        const response = await apiClient<InvoiceDetail>("/schools/fees/invoices", {
          method: "POST",
          body: { ...payload, student_id: selectedStudent.id },
        });
        toast.success(`Invoice ${response.data.invoice_number} created for ${selectedStudent.full_name}.`);
      } else {
        if (!effectiveClassId) {
          setError("Select a class or fee structure linked to a class.");
          setLoading(false);
          return;
        }
        const studentIds = await resolveBulkStudentIds();
        if (studentIds.length === 0) {
          setError("No active students found in the selected class.");
          setLoading(false);
          return;
        }
        const response = await apiClient<InvoiceBulkResult>("/schools/fees/invoices/bulk", {
          method: "POST",
          body: { ...payload, student_ids: studentIds },
        });
        toast.success(`${response.data.created} invoice(s) created. ${response.data.failed} failed.`);
      }
      reset();
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice(s).");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      size="xl"
      title="New invoice"
      description="Create a single invoice or bulk-generate for a class."
      footer={
        <button type="submit" form="add-invoice-form" disabled={loading} className="ms-btn-primary w-full">
          {loading ? "Creating…" : mode === "single" ? `Create invoice (${formatUGX(total)})` : "Bulk create invoices"}
        </button>
      }
    >
      <form id="add-invoice-form" onSubmit={(e) => void submit(e)} className="space-y-4">
        <div className="flex gap-1 rounded-lg border border-theme bg-input p-1">
          {(["single", "bulk"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm capitalize",
                mode === value ? "bg-theme-surface shadow-theme-card" : "text-theme-muted",
              )}
              onClick={() => setMode(value)}
            >
              {value}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Fee structure (auto-fill)</span>
          <select className="ms-input w-full" value={feeStructureId} onChange={(e) => applyFeeStructure(e.target.value)}>
            <option value="">None</option>
            {(structures ?? []).map((structure) => (
              <option key={structure.id} value={structure.id}>
                {structure.class_name} — {structure.term_name} {structure.academic_year} ({formatUGX(Number(structure.amount))})
              </option>
            ))}
          </select>
        </label>

        {mode === "single" ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Search student</span>
              <input className="ms-input w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            {!selectedStudent && (searchResults?.students.length ?? 0) > 0 ? (
              <ul className="divide-y divide-theme rounded-lg border border-theme">
                {searchResults!.students.map((student) => (
                  <li key={student.id}>
                    <button
                      type="button"
                      className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-nav-hover"
                      onClick={() => {
                        setSelectedStudent(student);
                        setSearch(student.full_name);
                      }}
                    >
                      <span>{student.full_name}</span>
                      <span className="text-theme-muted">{student.learner_id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selectedStudent ? (
              <p className="text-sm text-theme-primary">
                Selected: {selectedStudent.full_name} ({selectedStudent.learner_id})
              </p>
            ) : null}
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Class</span>
              <select
                className="ms-input w-full"
                value={effectiveClassId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSelectedStudents(new Set());
                  if (feeStructureId) {
                    const structure = structures?.find((row) => row.id === feeStructureId);
                    if (structure && structure.class_id !== e.target.value) {
                      setFeeStructureId("");
                    }
                  }
                }}
              >
                <option value="">Select class</option>
                {(classes ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatClassLabel(item.level, item.stream)}
                  </option>
                ))}
              </select>
            </label>
            {selectedStructure && effectiveClassId === selectedStructure.class_id ? (
              <p className="text-xs text-theme-muted">
                Class set from fee structure: {selectedStructure.class_name}
              </p>
            ) : null}
            {classStudentsLoading ? (
              <p className="text-sm text-theme-muted">Loading students…</p>
            ) : classStudentsError ? (
              <p className="text-sm text-theme-danger">Could not load students for this class.</p>
            ) : effectiveClassId && classStudents.length === 0 ? (
              <p className="text-sm text-theme-muted">No active students in this class.</p>
            ) : classStudents.length > 0 ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-theme p-2 text-sm">
                {classStudents.map((student) => (
                  <label key={student.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedStudents.has(student.id)}
                      onChange={() => {
                        setSelectedStudents((prev) => {
                          const next = new Set(prev);
                          if (next.has(student.id)) next.delete(student.id);
                          else next.add(student.id);
                          return next;
                        });
                      }}
                    />
                    <span>{student.full_name}</span>
                    <span className="text-theme-muted">{student.learner_id}</span>
                  </label>
                ))}
                <p className="pt-2 text-xs text-theme-muted">
                  {selectedStudents.size === 0
                    ? `All ${classStudentTotal} student(s) in this class will be invoiced.`
                    : `${selectedStudents.size} of ${classStudentTotal} selected`}
                  {classStudentTotal > classStudents.length
                    ? ` Showing first ${classStudents.length}; submit will include all ${classStudentTotal}.`
                    : null}
                </p>
              </div>
            ) : null}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Term *</span>
            <input className="ms-input w-full" value={termName} onChange={(e) => setTermName(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Year *</span>
            <input
              type="number"
              className="ms-input w-full"
              value={academicYear}
              onChange={(e) => setAcademicYear(Number(e.target.value))}
              required
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Due date</span>
          <input type="date" className="ms-input w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Items</span>
            <button
              type="button"
              className="text-xs text-theme-accent hover:underline"
              onClick={() =>
                setItems((prev) => [...prev, { description: "", account_id: "", quantity: 1, unit_amount: 0 }])
              }
            >
              Add line
            </button>
          </div>
          {items.map((item, index) => (
            <div key={index} className="space-y-2 rounded-lg border border-theme p-3">
              <input
                className="ms-input w-full"
                placeholder="Description"
                value={item.description}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], description: e.target.value };
                  setItems(next);
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  className="ms-input w-full"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => {
                    const next = [...items];
                    next[index] = { ...next[index], quantity: Number(e.target.value) || 1 };
                    setItems(next);
                  }}
                />
                <input
                  className="ms-input w-full"
                  placeholder="Unit amount"
                  value={formatUGXInput(item.unit_amount)}
                  onChange={(e) => {
                    const next = [...items];
                    next[index] = { ...next[index], unit_amount: parseUGXInput(e.target.value) };
                    setItems(next);
                  }}
                />
              </div>
            </div>
          ))}
          <p className="text-right text-sm font-medium">Total: {formatUGX(total)}</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Notes</span>
          <textarea className="ms-input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error ? <p className="text-sm text-theme-danger">{error}</p> : null}
      </form>
    </Modal>
  );
}
