"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { PAGE_SIZE_OPTIONS } from "@makyschool/shared/constants";
import { defaultClassAndYear } from "@/lib/olevel/registration";
import { useClientPagination } from "@/hooks/useClientPagination";
import {
  useOLevelClasses,
  useOLevelCurriculumSubjects,
  useOLevelExamSessions,
  useOLevelMarkGrid,
  useOLevelTerms,
} from "@/hooks/useOLevel";

export function OLevelMarksReviewContent() {
  const { data: classes = [], isSuccess: classesReady } = useOLevelClasses();
  const { data: terms = [], isSuccess: termsReady } = useOLevelTerms();
  const defaults = useMemo(() => defaultClassAndYear(classes, terms), [classes, terms]);
  const [termId, setTermId] = useState("");
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    if (filtersReady) return;
    if (!classesReady || !termsReady) return;
    setTermId(defaults.termId);
    setFiltersReady(true);
  }, [filtersReady, classesReady, termsReady, defaults.termId]);

  const { data: sessions = [] } = useOLevelExamSessions(
    { termId: termId || undefined },
    filtersReady,
  );
  const [sessionId, setSessionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setDefaultsApplied(false);
    setSessionId("");
    setSubjectId("");
  }, [termId]);

  useEffect(() => {
    if (defaultsApplied || !sessions.length) return;
    const preferred =
      sessions.find((s) => s.status === "open") ??
      sessions.find((s) => s.status === "closed") ??
      sessions[0];
    if (preferred) setSessionId(preferred.id);
    setDefaultsApplied(true);
  }, [sessions, defaultsApplied]);

  const session = sessions.find((s) => s.id === sessionId);
  const { data: subjectsRaw = [] } = useOLevelCurriculumSubjects(session?.curriculumId);
  const subjects = Array.from(
    new Map(subjectsRaw.map((s) => [s.subjectId, s])).values(),
  );

  useEffect(() => {
    if (!subjects.length) {
      setSubjectId("");
      return;
    }
    if (!subjects.some((s) => s.subjectId === subjectId)) {
      setSubjectId(subjects[0]?.subjectId ?? "");
    }
  }, [subjects, subjectId]);

  const { data: grid } = useOLevelMarkGrid(sessionId || undefined, subjectId || undefined);
  const marks = useMemo(() => {
    const rows = grid?.marks ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (m) =>
        (m.studentName ?? "").toLowerCase().includes(q) ||
        (m.learnerId ?? "").toLowerCase().includes(q),
    );
  }, [grid, query]);

  const { paged, page, setPage, pageSize, setPageSize, total } = useClientPagination({
    items: marks,
    resetDeps: [sessionId, subjectId, query],
  });

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="O-Level"
      title="Marks review"
      description="Read-only marks entered for each subject."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-3 rounded-xl border border-theme bg-theme-surface p-4">
          <select
            className="ms-input"
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            aria-label="Term"
          >
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.academicYearName}
                {t.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </select>
          <select
            className="ms-input"
            value={sessionId}
            onChange={(e) => {
              setSessionId(e.target.value);
              setSubjectId("");
              setQuery("");
            }}
          >
            <option value="">Choose session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {s.className}
              </option>
            ))}
          </select>
          <select
            className="ms-input"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={!sessionId}
          >
            <option value="">Choose subject</option>
            {subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.name}
              </option>
            ))}
          </select>
          {grid ? (
            <input
              className="ms-input min-w-48 flex-1"
              placeholder="Search student…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          ) : null}
        </div>

        {grid ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-theme bg-theme-surface">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-theme-muted">
                  <tr>
                    <th className="p-3 text-left">Student</th>
                    <th className="p-3 text-left">Student ID</th>
                    <th className="p-3 text-left">Score</th>
                    <th className="p-3 text-left">Absent</th>
                    <th className="p-3 text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((m) => (
                    <tr key={m.studentId} className="border-t border-theme">
                      <td className="p-3 font-medium text-theme-primary">
                        {m.studentName || "Unknown student"}
                      </td>
                      <td className="p-3 text-theme-muted">{m.learnerId || "—"}</td>
                      <td className="p-3">
                        {m.rawScore ?? "—"} / {grid.examSession.maxMarks}
                      </td>
                      <td className="p-3">{m.isAbsent ? "Yes" : "No"}</td>
                      <td className="p-3">{m.remarks ?? "—"}</td>
                    </tr>
                  ))}
                  {!paged.length ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-theme-muted">
                        {query ? "No students match your search." : "No marks for this subject."}
                      </td>
                    </tr>
                  ) : null}
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
              noun="students"
            />
          </>
        ) : (
          <p className="text-sm text-theme-muted">
            {sessionId && subjectId
              ? "Loading marks…"
              : "Select a session and subject to review marks."}
          </p>
        )}
      </div>
    </DashboardPage>
  );
}
