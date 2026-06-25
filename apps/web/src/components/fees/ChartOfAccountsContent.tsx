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
import { useApiSWR } from "@/hooks/useApiSWR";
import { apiClient } from "@/lib/api/client";
import type { ChartAccount, ChartAccountType } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

const TAB_OPTIONS: Array<{ value: ChartAccountType; label: string }> = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

export function ChartOfAccountsContent() {
  const { toast } = useToast();
  const [tab, setTab] = useState<ChartAccountType>("income");
  const [addOpen, setAddOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<ChartAccount | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const query = useMemo(() => `/schools/fees/accounts?account_type=${tab}`, [tab]);
  const { data, error, isLoading, mutate } = useApiSWR<{ accounts: ChartAccount[] }>(query);
  const accounts = data?.accounts ?? [];

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await apiClient(`/schools/fees/accounts/${deactivateTarget.id}`, {
        method: "PATCH",
        body: { is_active: false },
      });
      toast.success(`Account ${deactivateTarget.code} deactivated.`);
      setDeactivateTarget(null);
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate account.");
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Chart of accounts"
        description="Income and expense accounts for invoicing, other income, and budgets."
        actions={
          <CanDo action="manageAccounts">
            <button type="button" className="ms-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add account
            </button>
          </CanDo>
        }
      />

      <DataListPanel
        toolbar={
          <ListToolbar
            filters={
              <FilterField label="Account type" className="sm:col-span-2 lg:col-span-1">
                <FilterSegment
                  value={tab}
                  onChange={setTab}
                  aria-label="Account type"
                  options={TAB_OPTIONS}
                />
              </FilterField>
            }
          />
        }
      >
        <QueryState
          error={error}
          isLoading={isLoading}
          data={accounts}
          onRetry={() => void mutate()}
          loading={<Skeleton className="m-4 h-48" />}
          empty={
            <div className="p-6">
              <EmptyState
                title={`No ${tab} accounts yet.`}
                description="Add accounts to classify income and expenses."
                action={
                  <CanDo action="manageAccounts">
                    <button type="button" className="ms-btn-primary" onClick={() => setAddOpen(true)}>
                      Add account
                    </button>
                  </CanDo>
                }
              />
            </div>
          }
          isEmpty={(rows) => rows.length === 0}
        >
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="ms-table w-full min-w-[32rem]">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((account) => (
                    <tr key={account.id} className={!account.is_active ? "opacity-60" : undefined}>
                      <td className="font-mono text-sm">{account.code}</td>
                      <td className="font-medium">{account.name}</td>
                      <td>{account.category ?? "—"}</td>
                      <td>{account.is_active ? "Active" : "Inactive"}</td>
                      <td>
                        <CanDo action="manageAccounts">
                          {account.is_active ? (
                            <button
                              type="button"
                              className="text-xs text-theme-danger hover:underline"
                              onClick={() => setDeactivateTarget(account)}
                            >
                              Deactivate
                            </button>
                          ) : null}
                        </CanDo>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </DataListPanel>

      <AddChartAccountPanel
        open={addOpen}
        defaultType={tab}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          void mutate();
          setAddOpen(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title="Deactivate account?"
        description={
          deactivateTarget
            ? `Deactivate ${deactivateTarget.code} — ${deactivateTarget.name}? Existing transactions will be preserved.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="danger"
        loading={deactivating}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={() => void handleDeactivate()}
      />
    </section>
  );
}

function AddChartAccountPanel({
  open,
  defaultType,
  onClose,
  onSaved,
}: {
  open: boolean;
  defaultType: ChartAccountType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<ChartAccountType>(defaultType);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiClient("/schools/fees/accounts", {
        method: "POST",
        body: {
          code: code.trim(),
          name: name.trim(),
          account_type: accountType,
          category: category.trim() || undefined,
          description: description.trim() || undefined,
        },
      });
      toast.success(`Account ${code.trim()} created.`);
      setCode("");
      setName("");
      setCategory("");
      setDescription("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Add account"
      description="Create a chart of accounts entry."
      footer={
        <button type="submit" form="add-chart-account-form" disabled={loading} className="ms-btn-primary w-full">
          {loading ? "Creating…" : "Create account"}
        </button>
      }
    >
      <form id="add-chart-account-form" onSubmit={(e) => void submit(e)} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Account type *</span>
          <select
            className="ms-input w-full"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as ChartAccountType)}
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Code *</span>
          <input className="ms-input w-full font-mono" value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Name *</span>
          <input className="ms-input w-full" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Category</span>
          <input className="ms-input w-full" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Description</span>
          <textarea className="ms-input w-full" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error ? <p className="text-sm text-theme-danger">{error}</p> : null}
      </form>
    </Modal>
  );
}
