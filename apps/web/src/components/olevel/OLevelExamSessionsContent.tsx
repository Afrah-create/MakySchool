"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { PAGE_SIZE_OPTIONS } from "@makyschool/shared/constants";
import { olevelApi } from "@/lib/api/olevel";
import { defaultClassAndYear } from "@/lib/olevel/registration";
import { useClientPagination } from "@/hooks/useClientPagination";
import {
  useOLevelClasses,
  useOLevelCurriculum,
  useOLevelExamSessions,
  useOLevelSubmissions,
  useOLevelTerms,
} from "@/hooks/useOLevel";
import { useToast } from "@/providers/ToastProvider";

type Banner = { tone: "success" | "error" | "info"; message: string };
type SessionAction = { id: string; kind: "open" | "close" };

export function OLevelExamSessionsContent() {
  const { toast } = useToast();
  const { data: curriculum, isPending: curriculumPending } = useOLevelCurriculum();
  const { data: classes = [] } = useOLevelClasses();
  const { data: terms = [] } = useOLevelTerms();
  const defaults = useMemo(() => defaultClassAndYear(classes, terms), [classes, terms]);

  const [filterClassId, setFilterClassId] = useState("");
  const [filterTermId, setFilterTermId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const [formClassId, setFormClassId] = useState("");
  const [formTermId, setFormTermId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formMaxMarks, setFormMaxMarks] = useState("100");
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState("");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [confirm, setConfirm] = useState<SessionAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (defaultsApplied) return;
    if (!defaults.classId && !defaults.termId) return;
    setFilterClassId(defaults.classId);
    setFilterTermId(defaults.termId);
    setFormClassId(defaults.classId);
    setFormTermId(defaults.termId);
    setDefaultsApplied(true);
  }, [defaults, defaultsApplied]);

  const categories = curriculum?.assessmentCategories ?? [];
  useEffect(() => {
    if (!categories.length) return;
    if (!formCategoryId || !categories.some((c) => c.id === formCategoryId)) {
      setFormCategoryId(categories[0]!.id);
    }
  }, [categories, formCategoryId]);

  const formTerm = terms.find((t) => t.id === formTermId);
  const formCategory = categories.find((c) => c.id === formCategoryId);
  const formClass = classes.find((c) => c.id === formClassId);

  useEffect(() => {
    if (!formTitle.trim() && formCategory && formTerm && formClass) {
      setFormTitle(`${formCategory.name} · ${formClass.name} · ${formTerm.name}`);
    }
    // Only suggest once fields become available; don't fight user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formCategoryId, formTermId, formClassId]);

  const { data: sessions = [], refetch, isFetching } = useOLevelExamSessions({
    classId: filterClassId || undefined,
    termId: filterTermId || undefined,
    status: filterStatus || undefined,
  });
  const { data: submissions = [] } = useOLevelSubmissions(selected || undefined);

  const { paged, page, setPage, pageSize, setPageSize, total } = useClientPagination({
    items: sessions,
    resetDeps: [filterClassId, filterTermId, filterStatus],
  });

  function showBanner(tone: Banner["tone"], message: string) {
    setBanner({ tone, message });
    if (tone === "success") toast.success(message);
    else if (tone === "error") toast.error(message);
    else toast.info(message);
  }

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);

    if (!curriculum) {
      showBanner("error", "Set up the O-Level curriculum before creating exam sessions.");
      return;
    }
    if (!formClassId) {
      showBanner("error", "Choose a class for the exam session.");
      return;
    }
    if (!formTerm || !formTermId) {
      showBanner("error", "Choose a term for the exam session.");
      return;
    }
    if (!formCategoryId) {
      showBanner("error", "Choose an assessment category (e.g. CA or End-of-Term Exam).");
      return;
    }
    const title = formTitle.trim();
    if (!title) {
      showBanner("error", "Enter a session title.");
      return;
    }
    const maxMarks = Number(formMaxMarks);
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
      showBanner("error", "Max marks must be a positive number.");
      return;
    }

    setCreating(true);
    try {
      await olevelApi.createExamSession({
        curriculumId: curriculum.id,
        classId: formClassId,
        termId: formTerm.id,
        academicYearId: formTerm.academicYearId,
        categoryId: formCategoryId,
        title,
        maxMarks,
      });
      showBanner("success", `Exam session “${title}” created as draft.`);
      setFilterClassId(formClassId);
      setFilterTermId(formTermId);
      setFilterStatus("");
      const nextCategory = categories.find((c) => c.id === formCategoryId);
      const nextClass = classes.find((c) => c.id === formClassId);
      const nextTerm = terms.find((t) => t.id === formTermId);
      if (nextCategory && nextClass && nextTerm) {
        setFormTitle(`${nextCategory.name} · ${nextClass.name} · ${nextTerm.name}`);
      } else {
        setFormTitle("");
      }
      await refetch();
    } catch (err) {
      showBanner(
        "error",
        err instanceof Error ? err.message : "Could not create exam session.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function runSessionAction() {
    if (!confirm) return;
    setActionBusy(true);
    setBanner(null);
    try {
      if (confirm.kind === "open") {
        await olevelApi.openExamSession(confirm.id);
        showBanner("success", "Exam session opened. Teachers can enter marks.");
      } else {
        await olevelApi.closeExamSession(confirm.id);
        showBanner("success", "Exam session closed.");
      }
      setConfirm(null);
      await refetch();
    } catch (err) {
      showBanner(
        "error",
        err instanceof Error ? err.message : `Could not ${confirm.kind} session.`,
      );
    } finally {
      setActionBusy(false);
    }
  }

  const canCreate =
    !!curriculum && !!formClassId && !!formTermId && !!formCategoryId && !!formTitle.trim();

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="O-Level"
      title="Exam sessions"
      description="Create assessment sessions (CA / end-of-term), then open them for teachers to enter marks."
    >
      <div className="space-y-5">
        {banner ? (
          <StatusBanner
            tone={banner.tone}
            message={banner.message}
            onDismiss={() => setBanner(null)}
            autoDismissMs={banner.tone === "success" ? 5000 : undefined}
          />
        ) : null}

        {!curriculumPending && !curriculum ? (
          <StatusBanner
            tone="info"
            message="O-Level curriculum is not set up yet. Create it from the O-Level overview first."
          />
        ) : null}

        <section className="rounded-xl border border-theme bg-theme-surface p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-theme-primary">Create exam session</h2>
            <p className="mt-1 text-sm text-theme-muted">
              Sessions start as draft. Open a session when teachers should begin entering marks.
            </p>
          </div>

          <form
            className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => void createSession(e)}
          >
            <label className="text-sm text-theme-muted">
              Class
              <select
                className="ms-input mt-1 w-full"
                value={formClassId}
                onChange={(e) => setFormClassId(e.target.value)}
                required
              >
                <option value="">Choose class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-theme-muted">
              Term
              <select
                className="ms-input mt-1 w-full"
                value={formTermId}
                onChange={(e) => setFormTermId(e.target.value)}
                required
              >
                <option value="">Choose term</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.academicYearName}
                    {t.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-theme-muted">
              Assessment category
              <select
                className="ms-input mt-1 w-full"
                value={formCategoryId}
                onChange={(e) => setFormCategoryId(e.target.value)}
                required
                disabled={!categories.length}
              >
                {!categories.length ? (
                  <option value="">No categories configured</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.weightPercent}%)
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="text-sm text-theme-muted md:col-span-2">
              Session title
              <input
                className="ms-input mt-1 w-full"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. End-of-Term Exam · S1 East · Term 1"
                required
              />
            </label>

            <label className="text-sm text-theme-muted">
              Max marks
              <input
                className="ms-input mt-1 w-full"
                type="number"
                min={1}
                value={formMaxMarks}
                onChange={(e) => setFormMaxMarks(e.target.value)}
                required
              />
            </label>

            <div className="flex items-end md:col-span-2 lg:col-span-3">
              <LoadingButton
                type="submit"
                loading={creating}
                loadingLabel="Creating…"
                disabled={!canCreate || creating}
              >
                Create session
              </LoadingButton>
            </div>
          </form>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-semibold text-theme-primary">
              Sessions{isFetching ? " · refreshing…" : ""}
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                className="ms-input"
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
                aria-label="Filter by class"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                className="ms-input"
                value={filterTermId}
                onChange={(e) => setFilterTermId(e.target.value)}
                aria-label="Filter by term"
              >
                <option value="">All terms</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.academicYearName}
                  </option>
                ))}
              </select>
              <select
                className="ms-input"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                <option value="draft">draft</option>
                <option value="open">open</option>
                <option value="closed">closed</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-theme bg-theme-surface">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-theme-muted">
                <tr>
                  <th className="p-3 text-left">Session</th>
                  <th className="text-left">Class</th>
                  <th className="text-left">Term</th>
                  <th className="text-left">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!sessions.length ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-theme-muted">
                      No exam sessions for these filters. Create one above.
                    </td>
                  </tr>
                ) : (
                  paged.map((s) => (
                    <tr key={s.id} className="border-t border-theme">
                      <td className="p-3">
                        <div className="font-medium text-theme-primary">{s.title}</div>
                        <div className="text-xs text-theme-muted">
                          {s.categoryName} · max {s.maxMarks}
                        </div>
                      </td>
                      <td className="p-3">{s.className}</td>
                      <td className="p-3">{s.termName}</td>
                      <td className="p-3">
                        <StatusPill status={s.status} />
                      </td>
                      <td className="p-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-sm text-theme-accent"
                          onClick={() => setSelected(selected === s.id ? "" : s.id)}
                        >
                          {selected === s.id ? "Hide submissions" : "Submissions"}
                        </button>
                        {s.status === "draft" || s.status === "closed" ? (
                          <button
                            type="button"
                            className="rounded-lg bg-theme-accent px-2.5 py-1 text-sm text-white"
                            onClick={() => setConfirm({ id: s.id, kind: "open" })}
                          >
                            Open
                          </button>
                        ) : null}
                        {s.status === "open" ? (
                          <button
                            type="button"
                            className="rounded-lg bg-theme-raised px-2.5 py-1 text-sm"
                            onClick={() => setConfirm({ id: s.id, kind: "close" })}
                          >
                            Close
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            noun="sessions"
          />
        </section>

        {selected ? (
          <section className="rounded-xl border border-theme bg-theme-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-theme-primary">Subject submissions</h2>
              <button
                type="button"
                className="text-sm text-theme-muted"
                onClick={() => setSelected("")}
              >
                Close
              </button>
            </div>
            {submissions.map((x) => (
              <div
                key={x.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-theme py-3 text-sm"
              >
                <span>
                  {x.subjectName} · {x.teacherName}
                </span>
                <span className="text-theme-muted">
                  {x.enteredCount} entered · {x.status}
                  {x.status === "submitted" ? (
                    <button
                      type="button"
                      className="ml-2 text-theme-accent"
                      onClick={async () => {
                        const reason = prompt("Reason for unlock");
                        if (!reason?.trim()) return;
                        try {
                          await olevelApi.unlockMarks(selected, {
                            subjectId: x.subjectId,
                            teacherId: x.teacherId,
                            reason: reason.trim(),
                          });
                          showBanner("success", "Marks unlocked for editing.");
                        } catch (err) {
                          showBanner(
                            "error",
                            err instanceof Error ? err.message : "Unlock failed.",
                          );
                        }
                      }}
                    >
                      Unlock
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
            {!submissions.length ? (
              <p className="mt-3 text-sm text-theme-muted">
                No mark submissions yet. Teachers see this session after it is opened.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === "open" ? "Open exam session?" : "Close exam session?"}
        description={
          confirm?.kind === "open"
            ? "Teachers assigned to subjects in this class will be able to enter marks."
            : "Teachers will no longer be able to enter marks. All subject submissions must be submitted first."
        }
        confirmLabel={confirm?.kind === "open" ? "Open session" : "Close session"}
        loading={actionBusy}
        onCancel={() => {
          if (!actionBusy) setConfirm(null);
        }}
        onConfirm={() => void runSessionAction()}
      />
    </DashboardPage>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "open"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "closed"
        ? "bg-theme-raised text-theme-muted"
        : "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  return <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${tone}`}>{status}</span>;
}
