"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  Filter,
  GraduationCap,
  LayoutGrid,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { can } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";
import { cn } from "@makyschool/ui/lib/cn";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useAuth } from "@/hooks/useAuth";
import { useOptionalSchool } from "@/providers/SchoolProvider";
import {
  filterNavGroupsByRole,
  filterNavGroupsBySchoolType,
  flattenNavItems,
  schoolAdminNavGroups,
} from "@/lib/roles/school-admin-nav";
import {
  filterPortalNavGroupsByRole,
  filterPortalNavGroupsBySchoolType,
  type PortalNavItem,
} from "@/lib/roles/portal-nav";
import { bursarNavGroups } from "@/lib/roles/bursar-nav";
import { teacherNavGroups } from "@/lib/roles/teacher-nav";
import { isSchoolAdminRole, portalForRole } from "@/lib/roles/portals";
import type { StudentsListResponse } from "@/lib/students/types";
import type { TeachersListResponse } from "@/lib/teachers/types";

type SearchScope = "all" | "students" | "teachers" | "pages";

const SCOPE_OPTIONS: Array<{
  value: SearchScope;
  label: string;
  icon: typeof Search;
}> = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "students", label: "Students", icon: UserRound },
  { value: "teachers", label: "Teachers", icon: GraduationCap },
  { value: "pages", label: "Pages", icon: BookOpen },
];

type ResultItem = {
  id: string;
  kind: "student" | "teacher" | "page";
  title: string;
  subtitle?: string;
  href: string;
};

type PanelPos = { top: number; left: number; width: number };

function flattenPortalItems(items: PortalNavItem[]): PortalNavItem[] {
  return items.flatMap((item) =>
    item.children?.length ? flattenPortalItems(item.children) : [item],
  );
}

function scopeLabel(scope: SearchScope) {
  return SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? "All";
}

function studentHrefForRole(role: UserRole, student: { id: string; class_id: string | null }) {
  const portal = portalForRole(role);
  if (portal === "teacher") {
    return student.class_id ? `/teacher/classes/${student.class_id}` : "/teacher/classes";
  }
  if (portal === "bursar") {
    return `/bursar/payments/new?student_id=${encodeURIComponent(student.id)}`;
  }
  return `/dashboard/students/${student.id}`;
}

function viewAllHref(role: UserRole, scope: SearchScope, query: string) {
  const portal = portalForRole(role);
  const q = query.trim();
  const qs = q ? `?search=${encodeURIComponent(q)}` : "";

  if (portal === "teacher") return "/teacher/classes";
  if (portal === "bursar") {
    return q ? `/bursar/payments/new?search=${encodeURIComponent(q)}` : "/bursar/payments/new";
  }
  if (scope === "teachers") return `/dashboard/teachers${qs}`;
  return `/dashboard/students${qs}`;
}

export function DashboardHeaderSearch({
  className,
  variant = "desktop",
}: {
  className?: string;
  variant?: "desktop" | "mobile";
}) {
  const router = useRouter();
  const { state } = useAuth();
  const schoolCtx = useOptionalSchool();
  const school = schoolCtx?.school ?? null;
  const role = state.user?.role;
  const authLoading = state.loading;
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scope, setScope] = useState<SearchScope>("all");
  const [query, setQuery] = useState("");
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const debounced = useDebouncedValue(query.trim(), 280);

  useEffect(() => setMounted(true), []);

  const isAdmin = role ? isSchoolAdminRole(role) : false;
  const isTeacher = role === "teacher";
  const isBursar = role === "bursar";
  const portal = role ? portalForRole(role) : null;

  const canStudents = role
    ? can(role, "viewAllClasses") || can(role, "viewOwnClasses") || can(role, "viewFees")
    : false;
  const canTeachers = role ? can(role, "viewAllStaff") : false;
  const canPages = isAdmin || isTeacher || isBursar;
  const hasSearchAccess = canStudents || canTeachers || canPages;

  const availableScopes = useMemo(() => {
    return SCOPE_OPTIONS.filter((opt) => {
      if (opt.value === "students") return canStudents;
      if (opt.value === "teachers") return canTeachers;
      if (opt.value === "pages") return canPages;
      return hasSearchAccess;
    });
  }, [canStudents, canTeachers, canPages, hasSearchAccess]);

  useEffect(() => {
    if (!availableScopes.some((s) => s.value === scope)) {
      setScope(availableScopes[0]?.value ?? "all");
    }
  }, [availableScopes, scope]);

  const fetchStudents =
    debounced.length >= 2 && canStudents && (scope === "all" || scope === "students");
  const fetchTeachers =
    debounced.length >= 2 && canTeachers && (scope === "all" || scope === "teachers");

  const { data: studentsData, isLoading: studentsLoading } = useSchoolSWR<StudentsListResponse>(
    fetchStudents
      ? `/schools/students?search=${encodeURIComponent(debounced)}&status=active&limit=6`
      : null,
  );
  const { data: teachersData, isLoading: teachersLoading } = useSchoolSWR<TeachersListResponse>(
    fetchTeachers
      ? `/schools/teachers?search=${encodeURIComponent(debounced)}&limit=6`
      : null,
  );

  const pageResults = useMemo(() => {
    if (!role || !canPages) return [] as ResultItem[];
    if (scope !== "all" && scope !== "pages") return [];
    if (debounced.length < 2) return [];

    const q = debounced.toLowerCase();

    if (portal === "school-admin") {
      const groups = filterNavGroupsBySchoolType(
        filterNavGroupsByRole(schoolAdminNavGroups, role),
        school?.school_type,
      );
      return groups
        .flatMap((g) => flattenNavItems(g.items))
        .filter((item) => item.label.toLowerCase().includes(q))
        .slice(0, 6)
        .map((item) => ({
          id: `page-${item.href}`,
          kind: "page" as const,
          title: item.label,
          subtitle: "Go to page",
          href: item.href,
        }));
    }

    const portalGroups =
      portal === "teacher"
        ? filterPortalNavGroupsBySchoolType(
            filterPortalNavGroupsByRole(teacherNavGroups, role),
            school?.school_type,
          )
        : filterPortalNavGroupsByRole(bursarNavGroups, role);

    return portalGroups
      .flatMap((g) => flattenPortalItems(g.items))
      .filter((item) => item.label.toLowerCase().includes(q))
      .slice(0, 6)
      .map((item) => ({
        id: `page-${item.href}`,
        kind: "page" as const,
        title: item.label,
        subtitle: "Go to page",
        href: item.href,
      }));
  }, [debounced, role, canPages, portal, school?.school_type, scope]);

  const results = useMemo(() => {
    if (!role) return [] as ResultItem[];
    const items: ResultItem[] = [];
    if (fetchStudents) {
      for (const s of studentsData?.students ?? []) {
        items.push({
          id: `student-${s.id}`,
          kind: "student",
          title: s.full_name,
          subtitle: [s.learner_id, s.class_name].filter(Boolean).join(" · "),
          href: studentHrefForRole(role, s),
        });
      }
    }
    if (fetchTeachers) {
      for (const t of teachersData?.teachers ?? []) {
        items.push({
          id: `teacher-${t.id}`,
          kind: "teacher",
          title: t.full_name,
          subtitle: t.email,
          href: `/dashboard/teachers/${t.id}`,
        });
      }
    }
    items.push(...pageResults);
    return items;
  }, [role, fetchStudents, fetchTeachers, studentsData, teachersData, pageResults]);

  const loading = (fetchStudents && studentsLoading) || (fetchTeachers && teachersLoading);
  const showResults = open && query.trim().length > 0;

  function updatePanelPos() {
    const el = anchorRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 360), window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPanelPos({ top: rect.bottom + 6, left, width });
  }

  useLayoutEffect(() => {
    if (variant !== "desktop") return;
    if (!showResults && !scopeOpen) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
    function onReposition() {
      updatePanelPos();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [variant, showResults, scopeOpen, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      const portalEl = document.getElementById(listId);
      if (portalEl?.contains(target)) return;
      closeSearch();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSearch();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, listId]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function closeSearch() {
    setOpen(false);
    setScopeOpen(false);
    setQuery("");
  }

  // Keep chrome stable while auth hydrates — avoid flashing away on soft nav.
  if (!authLoading && !role) return null;
  if (!authLoading && role && !hasSearchAccess) return null;

  function go(href: string) {
    closeSearch();
    router.push(href);
  }

  function viewAll() {
    if (!role) return;
    go(viewAllHref(role, scope, query));
  }

  const placeholder =
    scope === "students"
      ? "Search students…"
      : scope === "teachers"
        ? "Search teachers…"
        : scope === "pages"
          ? "Search pages…"
          : isTeacher || isBursar
            ? "Search students or pages…"
            : "Search students, teachers, pages…";

  function renderResultsList() {
    if (!showResults) return null;
    if (debounced.length < 2) {
      return <p className="px-3 py-3 text-xs text-theme-muted">Type at least 2 characters…</p>;
    }
    if (loading) {
      return <p className="px-3 py-3 text-xs text-theme-muted">Searching…</p>;
    }
    if (results.length === 0) {
      return (
        <p className="px-3 py-3 text-xs text-theme-muted">No matches for “{debounced}”.</p>
      );
    }
    return (
      <ul className="max-h-[min(24rem,50dvh)] overflow-y-auto py-1">
        {results.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-nav-hover"
              onClick={() => go(item.href)}
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-theme-raised text-theme-muted">
                {item.kind === "student" ? (
                  <UserRound className="h-3.5 w-3.5" />
                ) : item.kind === "teacher" ? (
                  <UsersRound className="h-3.5 w-3.5" />
                ) : (
                  <BookOpen className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-theme-primary">
                  {item.title}
                </span>
                {item.subtitle ? (
                  <span className="block truncate text-[11px] text-theme-muted">{item.subtitle}</span>
                ) : null}
              </span>
              <span className="ml-2 shrink-0 self-center text-[10px] uppercase tracking-wide text-theme-faint">
                {item.kind}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  const scopeMenu = scopeOpen ? (
    <ul role="listbox" className="border-b border-theme py-1">
      {availableScopes.map((opt) => {
        const Icon = opt.icon;
        const active = opt.value === scope;
        return (
          <li key={opt.value}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm",
                active
                  ? "bg-theme-accent-muted font-medium text-theme-accent"
                  : "text-theme-primary hover:bg-nav-hover",
              )}
              onClick={() => {
                setScope(opt.value);
                setScopeOpen(false);
                inputRef.current?.focus();
              }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {opt.label}
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  const searchField = (
    <div className="relative flex min-w-0 flex-1 items-center">
      <Search
        className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-theme-muted"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setScopeOpen(false);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="ms-input !h-10 w-full !rounded-l-none !border-l-0 !py-0 !pl-8 !pr-8 !text-sm"
        aria-label="Search"
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        disabled={authLoading && !role}
      />
      {query ? (
        <button
          type="button"
          className="absolute right-1.5 rounded-md p-1 text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );

  const scopeButton = (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-l-lg border border-theme bg-theme-raised/60 px-2.5 text-xs font-medium text-theme-primary",
        "transition hover:bg-nav-hover",
      )}
      aria-haspopup="listbox"
      aria-expanded={scopeOpen}
      disabled={authLoading && !role}
      onClick={() => {
        setScopeOpen((v) => !v);
        setOpen(true);
      }}
    >
      <Filter className="h-3.5 w-3.5 text-theme-muted" aria-hidden />
      <span className="max-w-[4.5rem] truncate sm:max-w-none">{scopeLabel(scope)}</span>
      <ChevronDown className="h-3 w-3 text-theme-muted" aria-hidden />
    </button>
  );

  // —— Mobile: full-width fixed sheet (avoids mis-positioned portal clipping) ——
  if (variant === "mobile") {
    const sheet =
      mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex flex-col bg-theme-page/80 backdrop-blur-sm">
              <div
                className="border-b border-theme bg-theme-surface px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-theme-panel"
                ref={rootRef}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-theme-primary">Search</p>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
                    aria-label="Close search"
                    onClick={closeSearch}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex min-w-0 items-stretch">
                  {scopeButton}
                  {searchField}
                </div>
              </div>
              <div
                id={listId}
                className="min-h-0 flex-1 overflow-y-auto bg-theme-surface"
                onClick={(e) => {
                  if (e.target === e.currentTarget) closeSearch();
                }}
              >
                <div className="mx-auto w-full max-w-lg border-b border-theme bg-theme-surface">
                  {scopeMenu}
                  {renderResultsList()}
                  {showResults && debounced.length >= 2 && canStudents ? (
                    <div className="border-t border-theme">
                      <button
                        type="button"
                        className="w-full px-3 py-3 text-left text-xs font-medium text-theme-accent hover:bg-theme-accent-muted"
                        onClick={viewAll}
                      >
                        View all results
                      </button>
                    </div>
                  ) : null}
                  {!showResults && !scopeOpen ? (
                    <p className="px-4 py-6 text-center text-xs text-theme-muted">
                      Search students, staff, or pages
                    </p>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null;

    return (
      <div className={cn("relative", className)}>
        <button
          type="button"
          className="rounded-lg p-2 text-theme-muted transition hover:bg-nav-hover hover:text-theme-primary disabled:opacity-50"
          aria-label="Search"
          aria-expanded={open}
          disabled={authLoading && !role}
          onClick={() => setOpen(true)}
        >
          <Search className="h-4 w-4" />
        </button>
        {sheet}
      </div>
    );
  }

  // —— Desktop ——
  const floatingUi =
    mounted && (showResults || scopeOpen) && panelPos
      ? createPortal(
          <div
            id={listId}
            className="fixed z-[200] overflow-hidden rounded-xl border border-theme bg-theme-surface shadow-theme-panel"
            style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
          >
            {scopeMenu}
            {renderResultsList()}
            {showResults && debounced.length >= 2 && canStudents ? (
              <div className="border-t border-theme">
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-xs font-medium text-theme-accent hover:bg-theme-accent-muted"
                  onClick={viewAll}
                >
                  View all results
                </button>
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative z-[60] min-w-0 max-w-xl flex-1", className)}>
      <div ref={anchorRef} className="flex min-w-0 items-stretch">
        {scopeButton}
        {searchField}
      </div>
      {floatingUi}
    </div>
  );
}
