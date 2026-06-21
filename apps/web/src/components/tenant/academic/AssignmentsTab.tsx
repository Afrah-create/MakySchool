"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatClassLabel,
  getLevelsForSchoolType,
  sortClasses,
} from "@makyschool/shared/constants";
import type { ClassWithDetails, SchoolType, SubjectWithDetails } from "@makyschool/shared/types";
import {
  AssignmentDetailPanel,
  AssignmentLinkToggle,
  AssignmentPickerItem,
  AssignmentPickerPanel,
  AssignmentSaveBar,
  AssignmentSplitLayout,
  AssignmentWorkspace,
} from "@/components/tenant/academic/AssignmentLayout";
import {
  AcademicFilterSelect,
  AcademicPagination,
} from "@/components/tenant/academic/AcademicLayout";
import { Badge } from "@makyschool/ui/components/ui/Badge";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonTable } from "@makyschool/ui/components/ui/Skeleton";
import { useListControls } from "@/lib/academic/useListControls";

type LinkFilter = "all" | "linked" | "unlinked";

export function AssignmentsTab({
  schoolType,
  classes,
  subjects,
  loadingClasses,
  loadingSubjects,
  classesError,
  subjectsError,
  onRetry,
  actionLoading,
  onToggleClassSubject,
  onBulkLinkSubject,
}: {
  schoolType: SchoolType | null;
  classes: ClassWithDetails[] | undefined;
  subjects: SubjectWithDetails[] | undefined;
  loadingClasses: boolean;
  loadingSubjects: boolean;
  classesError?: unknown;
  subjectsError?: unknown;
  onRetry?: () => void;
  actionLoading: boolean;
  onToggleClassSubject: (classId: string, subjectId: string, linked: boolean) => Promise<void>;
  onBulkLinkSubject: (subjectId: string, classIds: string[]) => Promise<void>;
}) {
  const [mode, setMode] = useState<"by-subject" | "by-class">("by-subject");

  const isLoading =
    (loadingClasses && classes === undefined) || (loadingSubjects && subjects === undefined);
  const error = classesError ?? subjectsError;
  const hasData = classes !== undefined && subjects !== undefined;

  return (
    <QueryState
      isLoading={isLoading}
      error={error}
      data={hasData ? { classes: classes!, subjects: subjects! } : undefined}
      onRetry={onRetry}
      loading={<SkeletonTable rows={8} />}
      errorView={
        <EmptyState
          variant="error"
          title="Assignments unavailable"
          description="Unable to load classes and subjects right now."
          onRetry={onRetry}
        />
      }
      isEmpty={(payload) => payload.classes.length === 0 || payload.subjects.length === 0}
      empty={
        <EmptyState
          variant="compact"
          icon={null}
          title="Nothing to assign yet"
          description="Create at least one class and one subject on the other tabs first."
        />
      }
    >
      {(payload) => (
        <AssignmentWorkspace mode={mode} onModeChange={setMode}>
          {mode === "by-class" ? (
            <ByClassView
              schoolType={schoolType}
              classes={payload.classes}
              subjects={payload.subjects}
              actionLoading={actionLoading}
              onToggle={onToggleClassSubject}
            />
          ) : (
            <BySubjectView
              schoolType={schoolType}
              classes={payload.classes}
              subjects={payload.subjects}
              actionLoading={actionLoading}
              onSave={onBulkLinkSubject}
            />
          )}
        </AssignmentWorkspace>
      )}
    </QueryState>
  );
}

function ByClassView({
  schoolType,
  classes,
  subjects,
  actionLoading,
  onToggle,
}: {
  schoolType: SchoolType | null;
  classes: ClassWithDetails[];
  subjects: SubjectWithDetails[];
  actionLoading: boolean;
  onToggle: (classId: string, subjectId: string, linked: boolean) => Promise<void>;
}) {
  const sortedClasses = useMemo(() => sortClasses(classes, schoolType), [classes, schoolType]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classSearch, setClassSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const selectedClass = useMemo(
    () => sortedClasses.find((row) => row.id === selectedClassId) ?? sortedClasses[0] ?? null,
    [sortedClasses, selectedClassId],
  );

  const filteredClasses = useMemo(() => {
    const query = classSearch.trim().toLowerCase();
    if (!query) return sortedClasses;
    return sortedClasses.filter((row) => {
      const label = formatClassLabel(row.level, row.stream).toLowerCase();
      return label.includes(query) || row.level.toLowerCase().includes(query);
    });
  }, [sortedClasses, classSearch]);

  const subjectFilterFn = useCallback(
    (subject: SubjectWithDetails, query: string) => {
      if (!selectedClass) return false;
      const linked = selectedClass.subjects.some((item) => item.id === subject.id);
      const matchesQuery = !query || subject.name.toLowerCase().includes(query);
      const matchesLink =
        linkFilter === "all" ||
        (linkFilter === "linked" && linked) ||
        (linkFilter === "unlinked" && !linked);
      return matchesQuery && matchesLink;
    },
    [selectedClass, linkFilter],
  );

  const {
    query: subjectSearch,
    setQuery: setSubjectSearch,
    page,
    setPage,
    totalPages,
    paged: pagedSubjects,
    filteredCount,
    rangeStart,
    rangeEnd,
  } = useListControls({ items: subjects, pageSize: 15, filterFn: subjectFilterFn, resetDeps: [linkFilter, selectedClass?.id] });

  const linkedCount = selectedClass?.subjects.length ?? 0;

  async function handleToggle(subject: SubjectWithDetails) {
    if (!selectedClass) return;
    const linked = selectedClass.subjects.some((item) => item.id === subject.id);
    setTogglingId(subject.id);
    try {
      await onToggle(selectedClass.id, subject.id, linked);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <AssignmentSplitLayout
      picker={
        <AssignmentPickerPanel
          title="Classes"
          count={filteredClasses.length}
          searchPlaceholder="Search classes…"
          searchValue={classSearch}
          onSearchChange={setClassSearch}
        >
          {filteredClasses.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-theme-muted">No classes found.</p>
          ) : (
            filteredClasses.map((classRow) => {
              const label = formatClassLabel(classRow.level, classRow.stream);
              return (
                <AssignmentPickerItem
                  key={classRow.id}
                  active={selectedClass?.id === classRow.id}
                  title={label}
                  subtitle={`${classRow.subjects.length} of ${subjects.length} subjects`}
                  badge={classRow.level}
                  onClick={() => setSelectedClassId(classRow.id)}
                />
              );
            })
          )}
        </AssignmentPickerPanel>
      }
      detail={
        <AssignmentDetailPanel
          title={selectedClass ? formatClassLabel(selectedClass.level, selectedClass.stream) : "Select a class"}
          description="Toggle subjects for the selected class. Each change saves immediately."
          stats={
            selectedClass ? (
              <p className="text-xs text-theme-muted">
                <span className="font-medium text-theme-primary">{linkedCount}</span> of{" "}
                <span className="font-medium text-theme-primary">{subjects.length}</span> subjects linked
              </p>
            ) : null
          }
          toolbar={
            selectedClass ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={subjectSearch}
                  onChange={(event) => setSubjectSearch(event.target.value)}
                  placeholder="Search subjects…"
                  className="ms-input max-w-xs py-2 text-sm"
                />
                <AcademicFilterSelect
                  label="Filter by link status"
                  value={linkFilter}
                  onChange={(value) => setLinkFilter(value as LinkFilter)}
                  options={[
                    { value: "all", label: "All subjects" },
                    { value: "linked", label: "Linked only" },
                    { value: "unlinked", label: "Not linked" },
                  ]}
                />
              </div>
            ) : null
          }
          footer={
            filteredCount > 0 ? (
              <AcademicPagination
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                total={filteredCount}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            ) : null
          }
        >
          {!selectedClass ? (
            <div className="px-5 py-16">
              <EmptyState variant="compact" icon={null} title="Select a class" description="Choose a class from the list to manage its subjects." />
            </div>
          ) : filteredCount === 0 ? (
            <div className="px-5 py-16">
              <EmptyState variant="compact" icon={null} title="No subjects match" description="Try a different search or filter." />
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-table-header text-xs uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Subject</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {pagedSubjects.map((subject) => {
                  const linked = selectedClass.subjects.some((item) => item.id === subject.id);
                  const busy = actionLoading && togglingId === subject.id;

                  return (
                    <tr key={subject.id} className="transition hover:bg-table-row-hover">
                      <td className="px-5 py-3.5 font-medium text-theme-primary">{subject.name}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone={linked ? "success" : "neutral"}>{linked ? "Linked" : "Not linked"}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <AssignmentLinkToggle
                          linked={linked}
                          loading={busy}
                          disabled={actionLoading && !busy}
                          label={`${linked ? "Unlink" : "Link"} ${subject.name}`}
                          onToggle={() => void handleToggle(subject)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </AssignmentDetailPanel>
      }
    />
  );
}

function BySubjectView({
  schoolType,
  classes,
  subjects,
  actionLoading,
  onSave,
}: {
  schoolType: SchoolType | null;
  classes: ClassWithDetails[];
  subjects: SubjectWithDetails[];
  actionLoading: boolean;
  onSave: (subjectId: string, classIds: string[]) => Promise<void>;
}) {
  const sortedClasses = useMemo(() => sortClasses(classes, schoolType), [classes, schoolType]);
  const levels = useMemo(() => getLevelsForSchoolType(schoolType), [schoolType]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [draftClassIds, setDraftClassIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  const selectedSubject = useMemo(
    () => subjects.find((row) => row.id === selectedSubjectId) ?? subjects[0] ?? null,
    [subjects, selectedSubjectId],
  );

  useEffect(() => {
    if (!selectedSubject) {
      return;
    }

    const timer = window.setTimeout(() => {
      setDraftClassIds(selectedSubject.class_ids ?? []);
      setDirty(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedSubject]);

  const filteredSubjects = useMemo(() => {
    const query = subjectSearch.trim().toLowerCase();
    if (!query) return subjects;
    return subjects.filter((subject) => subject.name.toLowerCase().includes(query));
  }, [subjects, subjectSearch]);

  const classFilterFn = useCallback(
    (classRow: ClassWithDetails, query: string) => {
      const label = formatClassLabel(classRow.level, classRow.stream).toLowerCase();
      const linked = draftClassIds.includes(classRow.id);
      const matchesQuery =
        !query || label.includes(query) || classRow.level.toLowerCase().includes(query);
      const matchesLevel = levelFilter === "all" || classRow.level === levelFilter;
      const matchesLink =
        linkFilter === "all" ||
        (linkFilter === "linked" && linked) ||
        (linkFilter === "unlinked" && !linked);
      return matchesQuery && matchesLevel && matchesLink;
    },
    [draftClassIds, levelFilter, linkFilter],
  );

  const {
    query: classSearch,
    setQuery: setClassSearch,
    page,
    setPage,
    totalPages,
    paged: pagedClasses,
    filteredCount,
    rangeStart,
    rangeEnd,
  } = useListControls({
    items: sortedClasses,
    pageSize: 20,
    filterFn: classFilterFn,
    resetDeps: [levelFilter, linkFilter, selectedSubject?.id],
  });

  const baselineIds = useMemo(
    () => selectedSubject?.class_ids ?? [],
    [selectedSubject?.class_ids],
  );
  const linkedCount = draftClassIds.length;

  function toggleClass(classId: string) {
    setDraftClassIds((current) =>
      current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId],
    );
    setDirty(true);
  }

  function selectAllVisible() {
    const visibleIds = pagedClasses.map((row) => row.id);
    setDraftClassIds((current) => [...new Set([...current, ...visibleIds])]);
    setDirty(true);
  }

  function clearAllVisible() {
    const visibleIds = new Set(pagedClasses.map((row) => row.id));
    setDraftClassIds((current) => current.filter((id) => !visibleIds.has(id)));
    setDirty(true);
  }

  function selectLevel(level: string) {
    const levelIds = sortedClasses.filter((row) => row.level === level).map((row) => row.id);
    setDraftClassIds((current) => [...new Set([...current, ...levelIds])]);
    setDirty(true);
  }

  function clearLevel(level: string) {
    const levelIds = new Set(sortedClasses.filter((row) => row.level === level).map((row) => row.id));
    setDraftClassIds((current) => current.filter((id) => !levelIds.has(id)));
    setDirty(true);
  }

  function discardChanges() {
    setDraftClassIds(baselineIds);
    setDirty(false);
  }

  async function saveChanges() {
    if (!selectedSubject) return;
    try {
      await onSave(selectedSubject.id, draftClassIds);
      setDirty(false);
    } catch {
      // Parent shows feedback.
    }
  }

  const pendingChanges = useMemo(() => {
    const draft = new Set(draftClassIds);
    const base = new Set(baselineIds);
    let changes = 0;
    for (const id of draft) {
      if (!base.has(id)) changes += 1;
    }
    for (const id of base) {
      if (!draft.has(id)) changes += 1;
    }
    return changes;
  }, [draftClassIds, baselineIds]);

  return (
    <AssignmentSplitLayout
      picker={
        <AssignmentPickerPanel
          title="Subjects"
          count={filteredSubjects.length}
          searchPlaceholder="Search subjects…"
          searchValue={subjectSearch}
          onSearchChange={setSubjectSearch}
        >
          {filteredSubjects.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-theme-muted">No subjects found.</p>
          ) : (
            filteredSubjects.map((subject) => (
              <AssignmentPickerItem
                key={subject.id}
                active={selectedSubject?.id === subject.id}
                title={subject.name}
                subtitle={`Linked to ${subject.class_count} class${subject.class_count === 1 ? "" : "es"}`}
                onClick={() => setSelectedSubjectId(subject.id)}
              />
            ))
          )}
        </AssignmentPickerPanel>
      }
      detail={
        <AssignmentDetailPanel
          title={selectedSubject ? selectedSubject.name : "Select a subject"}
          description="Check classes below, then save. Use bulk actions for entire levels or the current page."
          stats={
            selectedSubject ? (
              <p className="text-xs text-theme-muted">
                <span className="font-medium text-theme-primary">{linkedCount}</span> of{" "}
                <span className="font-medium text-theme-primary">{sortedClasses.length}</span> classes selected
                {dirty ? (
                  <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                    {pendingChanges} unsaved change{pendingChanges === 1 ? "" : "s"}
                  </span>
                ) : null}
              </p>
            ) : null
          }
          toolbar={
            selectedSubject ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <input
                    type="search"
                    value={classSearch}
                    onChange={(event) => setClassSearch(event.target.value)}
                    placeholder="Search classes…"
                    className="ms-input max-w-xs py-2 text-sm"
                  />
                  <AcademicFilterSelect
                    label="Filter by level"
                    value={levelFilter}
                    onChange={setLevelFilter}
                    options={[
                      { value: "all", label: "All levels" },
                      ...levels.map((level) => ({ value: level, label: level })),
                    ]}
                  />
                  <AcademicFilterSelect
                    label="Filter by selection"
                    value={linkFilter}
                    onChange={(value) => setLinkFilter(value as LinkFilter)}
                    options={[
                      { value: "all", label: "All classes" },
                      { value: "linked", label: "Selected" },
                      { value: "unlinked", label: "Not selected" },
                    ]}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={selectAllVisible} className="ms-btn-ghost rounded-lg px-3 py-1.5 text-xs">
                    Select page
                  </button>
                  <button type="button" onClick={clearAllVisible} className="ms-btn-ghost rounded-lg px-3 py-1.5 text-xs">
                    Clear page
                  </button>
                  {levelFilter !== "all" ? (
                    <>
                      <span className="text-theme-muted">·</span>
                      <button type="button" onClick={() => selectLevel(levelFilter)} className="ms-btn-ghost rounded-lg px-3 py-1.5 text-xs">
                        Select all {levelFilter}
                      </button>
                      <button type="button" onClick={() => clearLevel(levelFilter)} className="ms-btn-ghost rounded-lg px-3 py-1.5 text-xs">
                        Clear {levelFilter}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null
          }
          footer={
            <>
              {filteredCount > 0 ? (
                <AcademicPagination
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  total={filteredCount}
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              ) : null}
              {selectedSubject ? (
                <AssignmentSaveBar
                  dirty={dirty}
                  summary={
                    dirty
                      ? `${pendingChanges} change${pendingChanges === 1 ? "" : "s"} pending for ${selectedSubject.name}`
                      : `All changes saved for ${selectedSubject.name}`
                  }
                  onDiscard={discardChanges}
                  onSave={() => void saveChanges()}
                  saving={actionLoading}
                  saveDisabled={!dirty}
                />
              ) : null}
            </>
          }
        >
          {!selectedSubject ? (
            <div className="px-5 py-16">
              <EmptyState variant="compact" icon={null} title="Select a subject" description="Choose a subject from the list to assign classes." />
            </div>
          ) : filteredCount === 0 ? (
            <div className="px-5 py-16">
              <EmptyState variant="compact" icon={null} title="No classes match" description="Try a different search or filter." />
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-table-header text-xs uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="w-12 px-5 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-5 py-3 font-medium">Class</th>
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Level</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Stream</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {pagedClasses.map((classRow) => {
                  const label = formatClassLabel(classRow.level, classRow.stream);
                  const checked = draftClassIds.includes(classRow.id);

                  return (
                    <tr
                      key={classRow.id}
                      className="cursor-pointer transition hover:bg-table-row-hover"
                      onClick={() => toggleClass(classRow.id)}
                    >
                      <td className="px-5 py-3.5" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={actionLoading}
                          onChange={() => toggleClass(classRow.id)}
                          className="accent-theme h-4 w-4 rounded"
                          aria-label={`Select ${label}`}
                        />
                      </td>
                      <td className="px-5 py-3.5 font-medium text-theme-primary">{label}</td>
                      <td className="hidden px-5 py-3.5 text-theme-muted sm:table-cell">{classRow.level}</td>
                      <td className="hidden px-5 py-3.5 text-theme-muted md:table-cell">
                        {classRow.stream ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </AssignmentDetailPanel>
      }
    />
  );
}
