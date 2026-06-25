"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { FilterField } from "@makyschool/ui/components/ui/FilterField";
import { FilterSegment } from "@makyschool/ui/components/ui/FilterSegment";
import { ListToolbar } from "@makyschool/ui/components/ui/ListToolbar";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { CanDo } from "@/components/ui/CanDo";
import { FeesStatStrip } from "@/components/fees/FeesStatStrip";
import { useApiSWR } from "@/hooks/useApiSWR";
import { apiClient } from "@/lib/api/client";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import type { BudgetReport, BudgetType, ChartAccount } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

const TAB_OPTIONS: Array<{ value: BudgetType; label: string }> = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

export function BudgetContent() {
  const { toast } = useToast();
  const [tab, setTab] = useState<BudgetType>("income");
  const [termName, setTermName] = useState("Term 1");
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reportQuery = useMemo(
    () =>
      `/schools/fees/budget/report?term_name=${encodeURIComponent(termName)}&academic_year=${academicYear}`,
    [termName, academicYear],
  );
  const { data, error, isLoading, mutate } = useApiSWR<BudgetReport>(reportQuery);

  const rows = (data?.items ?? []).filter((row) => row.budget_type === tab);
  const summary = data?.summary;

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiClient(`/schools/fees/budget/${deleteId}`, { method: "DELETE" });
      toast.success("Budget line removed.");
      setDeleteId(null);
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete budget item.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Budget"
        description="Track income targets against actual collections."
        actions={
          <CanDo action="manageBudget">
            <button type="button" className="ms-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add budget line
            </button>
          </CanDo>
        }
      />

      {summary ? (
        <FeesStatStrip
          items={[
            { label: "Income budget", value: formatUGX(summary.total_budgeted_income) },
            { label: "Income actual", value: formatUGX(summary.total_actual_income) },
            { label: "Expense budget", value: formatUGX(summary.total_budgeted_expense) },
          ]}
        />
      ) : null}

      <DataListPanel
        toolbar={
          <ListToolbar
            filters={
              <>
                <FilterField label="Term">
                  <input
                    className="ms-input ms-input-compact w-full"
                    value={termName}
                    onChange={(e) => setTermName(e.target.value)}
                    placeholder="e.g. Term 1"
                  />
                </FilterField>
                <FilterField label="Year">
                  <input
                    type="number"
                    className="ms-input ms-input-compact w-full"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                  />
                </FilterField>
                <FilterField label="Type" className="sm:col-span-2 lg:col-span-1">
                  <FilterSegment
                    value={tab}
                    onChange={setTab}
                    aria-label="Budget type"
                    options={TAB_OPTIONS}
                  />
                </FilterField>
              </>
            }
          />
        }
      >
        {tab === "expense" ? (
          <p className="border-b border-theme px-4 py-3 text-sm text-theme-muted">
            Actual expense tracking coming soon. Budgeted amounts are shown below.
          </p>
        ) : null}

        <QueryState
          error={error}
          isLoading={isLoading}
          data={rows}
          onRetry={() => void mutate()}
          loading={<Skeleton className="m-4 h-48" />}
          empty={
            <div className="p-6">
              <EmptyState
                title="No budget lines for this term."
                description="Add income or expense budget targets."
                action={
                  <CanDo action="manageBudget">
                    <button type="button" className="ms-btn-primary" onClick={() => setAddOpen(true)}>
                      Add budget line
                    </button>
                  </CanDo>
                }
              />
            </div>
          }
          isEmpty={(items) => items.length === 0}
        >
          {(items) => (
            <div className="overflow-x-auto">
              <table className="ms-table w-full min-w-[40rem]">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Account</th>
                    <th className="text-right">Budgeted</th>
                    <th className="text-right">Actual</th>
                    <th className="text-right">Variance</th>
                    <th>Status</th>
                    <CanDo action="manageBudget">
                      <th />
                    </CanDo>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td className="font-medium">{row.name}</td>
                      <td className="font-mono text-sm">{row.account_code ?? "—"}</td>
                      <td className="text-right tabular-nums">{formatUGX(row.budgeted_amount)}</td>
                      <td className="text-right tabular-nums">
                        {row.actual_amount === null ? "—" : formatUGX(row.actual_amount)}
                      </td>
                      <td className="text-right tabular-nums">
                        {row.variance === null
                          ? "—"
                          : `${row.variance >= 0 ? "+" : ""}${formatUGX(row.variance)}`}
                      </td>
                      <td>
                        {row.status === "coming_soon" ? (
                          <span className="text-theme-muted">Coming soon</span>
                        ) : (
                          <span className="capitalize">{row.status.replace("_", " ")}</span>
                        )}
                      </td>
                      <CanDo action="manageBudget">
                        <td>
                          <button
                            type="button"
                            className="text-xs text-theme-danger hover:underline"
                            onClick={() => setDeleteId(row.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </CanDo>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </DataListPanel>

      <AddBudgetLinePanel
        open={addOpen}
        defaultType={tab}
        termName={termName}
        academicYear={Number(academicYear)}
        onClose={() => setAddOpen(false)}
        onSaved={() => void mutate()}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete budget line?"
        description="This removes the budget target for this term."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
      />
    </section>
  );
}

function AddBudgetLinePanel({
  open,
  defaultType,
  termName,
  academicYear,
  onClose,
  onSaved,
}: {
  open: boolean;
  defaultType: BudgetType;
  termName: string;
  academicYear: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [budgetType, setBudgetType] = useState<BudgetType>(defaultType);
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountType = budgetType === "income" ? "income" : "expense";
  const { data: accountsData } = useApiSWR<{ accounts: ChartAccount[] }>(
    open ? `/schools/fees/accounts?account_type=${accountType}` : null,
  );
  const accounts = accountsData?.accounts?.filter((a) => a.is_active) ?? [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiClient("/schools/fees/budget", {
        method: "POST",
        body: {
          name: name.trim(),
          term_name: termName,
          academic_year: academicYear,
          budget_type: budgetType,
          account_id: accountId || undefined,
          category: category.trim() || undefined,
          budgeted_amount: amount,
          notes: notes.trim() || undefined,
        },
      });
      toast.success(`Budget line "${name.trim()}" added.`);
      setName("");
      setAmount(0);
      setCategory("");
      setNotes("");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add budget line.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Add budget line"
      footer={
        <button type="submit" form="add-budget-form" disabled={loading} className="ms-btn-primary w-full">
          {loading ? "Saving…" : "Add budget line"}
        </button>
      }
    >
      <form id="add-budget-form" onSubmit={(e) => void submit(e)} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Type</span>
          <select
            className="ms-input w-full"
            value={budgetType}
            onChange={(e) => setBudgetType(e.target.value as BudgetType)}
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Name *</span>
          <input className="ms-input w-full" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Account</span>
          <select className="ms-input w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">None</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} — {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Budgeted amount *</span>
          <input
            className="ms-input w-full"
            value={formatUGXInput(amount)}
            onChange={(e) => setAmount(parseUGXInput(e.target.value))}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Category</span>
          <input className="ms-input w-full" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Notes</span>
          <textarea className="ms-input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error ? <p className="text-sm text-theme-danger">{error}</p> : null}
      </form>
    </Modal>
  );
}
