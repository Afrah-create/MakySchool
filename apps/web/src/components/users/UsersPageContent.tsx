"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import type { MakySchoolRole } from "@makyschool/shared/types";
import { CanDo } from "@/components/ui/CanDo";
import { AddUserPanel } from "@/components/users/AddUserPanel";
import { EditUserPanel } from "@/components/users/EditUserPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonTable } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@makyschool/shared/constants";
import { formatClassAssignmentLabel, roleBadgeClass, roleLabel } from "@/lib/users/display";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: MakySchoolRole;
  is_active: boolean;
  assigned_classes: Array<{
    class_id?: string;
    class_name?: string;
    level?: string;
    stream?: string | null;
    subject_name?: string | null;
  }>;
};

type Tab = "all" | "head_teacher" | "teacher";

const TAB_EMPTY: Record<Exclude<Tab, "all">, string> = {
  head_teacher: "No head teachers yet. Add one to get started.",
  teacher: "No teachers yet. Add one to get started.",
};

export function UsersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const canManage = state.user ? can(state.user.role, "manageUsers") : false;
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("role", tab);
    if (search.trim()) params.set("search", search.trim());
    const qs = params.toString();
    return `/schools/users${qs ? `?${qs}` : ""}`;
  }, [tab, search]);

  const { data, error, isLoading, isValidating, mutate } = useApiSWR<UserRow[]>(query);

  const users = data ?? [];

  useEffect(() => {
    if (searchParams.get("add") === "1" && canManage) {
      setAddOpen(true);
      router.replace("/dashboard/users", { scroll: false });
    }
  }, [searchParams, canManage, router]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-theme-primary">Users</h1>
        <p className="mt-1 text-sm text-theme-muted">Manage staff accounts for your school</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-theme pb-3">
        {(
          [
            ["all", "All"],
            ["head_teacher", "Head Teachers"],
            ["teacher", "Teachers"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === key
                ? "bg-theme-accent text-on-accent"
                : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            className="ms-input w-full pl-10"
          />
        </div>
        <CanDo action="manageUsers">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ms-btn-primary inline-flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add user
          </button>
        </CanDo>
      </div>

      <QueryState
        error={error}
        isLoading={isLoading}
        isValidating={isValidating}
        data={users}
        onRetry={() => void mutate()}
        isEmpty={(items) => items.length === 0}
        loading={<SkeletonTable rows={6} />}
        empty={
          <EmptyState
            title={tab === "all" ? "No users yet" : TAB_EMPTY[tab]}
            description={
              tab === "all"
                ? "Staff accounts you create will appear here."
                : "Use Add user to create an account for this role."
            }
          />
        }
      >
        {(items) => (
          <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
            <table className="ms-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Assigned classes</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => {
                  const classLabels = user.assigned_classes.map(formatClassAssignmentLabel);
                  const truncated =
                    classLabels.length > 2
                      ? `${classLabels.slice(0, 2).join(", ")}…`
                      : classLabels.join(", ") || "—";

                  return (
                    <tr key={user.id}>
                      <td>
                        <Link
                          href={`/dashboard/users/${user.id}`}
                          className="block font-medium text-theme-primary hover:text-theme-accent"
                        >
                          {user.full_name}
                        </Link>
                        <span className="text-xs text-theme-muted">{user.email}</span>
                      </td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(user.role)}`}
                        >
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate text-sm text-theme-muted">
                        {truncated}
                      </td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            user.is_active ? "badge-success" : "badge-danger"
                          }`}
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditUser(user)}
                            className="text-sm font-medium text-theme-accent hover:underline"
                          >
                            Edit
                          </button>
                          <CanDo action="manageUsers">
                            <button
                              type="button"
                              onClick={() => setEditUser(user)}
                              className="text-sm font-medium text-theme-muted hover:text-theme-primary"
                            >
                              {user.is_active ? "Deactivate" : "Reactivate"}
                            </button>
                          </CanDo>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>

      <AddUserPanel open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => void mutate()} />
      <EditUserPanel
        user={editUser}
        onClose={() => setEditUser(null)}
        onSaved={() => void mutate()}
      />
    </section>
  );
}
