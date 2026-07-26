'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  Users,
  AlertCircle,
  Lock,
  Search,
  Save,
} from 'lucide-react';
import { useDailyAttendance, useSaveAttendance, useTeacherTimetable } from '@/hooks/useAttendance';
import type { TimetableSlot } from '@/hooks/useAttendance';
import { todayEAT } from '@/lib/api/attendance';
import type { AttendanceStatus, BulkAttendanceEntry } from '@makyschool/shared';
import { useCurrentTerm } from '@/hooks/useCurrentTerm';
import { TablePagination } from '@makyschool/ui/components/ui/TablePagination';
import { useClientPagination } from '@/hooks/useClientPagination';
import {
  ATTENDANCE_STATUS_KEYS,
  ATTENDANCE_STATUS_STYLE,
  AttendanceStatusBadge,
  AttendanceTallyPill,
  studentInitials,
} from '@/components/attendance/attendanceStatusStyles';

const DRAFT_PREFIX = 'makyschool:attendance-draft:';
const REGISTER_PAGE_SIZE = 50;

type DraftState = {
  overrides: { [id: string]: AttendanceStatus };
  notes: { [id: string]: string };
};

function draftKey(slotId: string, date: string) {
  return `${DRAFT_PREFIX}${slotId}:${date}`;
}

function loadDraft(slotId: string, date: string): DraftState | null {
  if (typeof window === 'undefined' || !slotId) return null;
  try {
    const raw = localStorage.getItem(draftKey(slotId, date));
    if (!raw) return null;
    return JSON.parse(raw) as DraftState;
  } catch {
    return null;
  }
}

function saveDraftToStorage(slotId: string, date: string, draft: DraftState) {
  if (typeof window === 'undefined' || !slotId) return;
  try {
    localStorage.setItem(draftKey(slotId, date), JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

function clearDraft(slotId: string, date: string) {
  if (typeof window === 'undefined' || !slotId) return;
  localStorage.removeItem(draftKey(slotId, date));
}

function weekdayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function slotTimeLabel(slot: TimetableSlot): string {
  if (slot.startTime && slot.endTime) return `${slot.startTime}–${slot.endTime}`;
  return slot.timeLabel || '';
}

export default function AttendancePage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: term } = useCurrentTerm();

  const urlDate = searchParams.get('date');
  const urlSlotId = searchParams.get('slotId');
  const urlClassId = searchParams.get('classId');

  const [selectedDate, setSelectedDate] = useState(urlDate || todayEAT());
  const [selectedSlotId, setSelectedSlotId] = useState(urlSlotId || '');
  const [overrides, setOverrides] = useState<{ [id: string]: AttendanceStatus }>({});
  const [notes, setNotes] = useState<{ [id: string]: string }>({});
  const [selectedIds, setSelectedIds] = useState<{ [id: string]: boolean }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [forceLocked, setForceLocked] = useState(false);

  const termId = term?.id ?? '';

  const { data: slots = [], isPending: isPendingSlots } = useTeacherTimetable(selectedDate);
  const activeSlotId = selectedSlotId;
  const queryEnabled = !!activeSlotId && !!termId;

  useEffect(() => {
    if (urlDate) setSelectedDate(urlDate);
    if (urlSlotId) setSelectedSlotId(urlSlotId);
  }, [urlDate, urlSlotId]);

  useEffect(() => {
    if (urlSlotId || selectedSlotId || !urlClassId || slots.length === 0) return;
    const match = slots.find((s) => s.classId === urlClassId);
    if (match) setSelectedSlotId(match.timetableSlotId);
  }, [urlClassId, urlSlotId, selectedSlotId, slots]);

  // Prefer first unmarked period when none selected.
  useEffect(() => {
    if (selectedSlotId || slots.length === 0) return;
    const open = slots.find((s) => !s.alreadySubmitted) ?? slots[0];
    setSelectedSlotId(open.timetableSlotId);
  }, [slots, selectedSlotId]);

  const { data, isPending: isPendingAttendance, isError } = useDailyAttendance(
    activeSlotId,
    termId,
    selectedDate,
    queryEnabled,
  );

  const saveMutation = useSaveAttendance();

  useEffect(() => {
    setSelectedIds({});
    setSearchQuery('');
    setJustSaved(false);
    setDraftSaved(false);
    setSaveError(null);
    setForceLocked(false);

    const draft = loadDraft(activeSlotId, selectedDate);
    if (draft) {
      setOverrides(draft.overrides);
      setNotes(draft.notes);
    } else {
      setOverrides({});
      setNotes({});
    }
  }, [activeSlotId, selectedDate]);

  const activeSlot = slots.find((s) => s.timetableSlotId === activeSlotId);
  const alreadySubmitted = forceLocked || !!data?.alreadySubmitted;
  const isInitialTake = !!data && !alreadySubmitted;

  const rows = useMemo(() => {
    if (!data) return [];
    return data.students.map((s) => ({
      ...s,
      status:
        overrides[s.studentId] ??
        s.status ??
        (isInitialTake ? ('present' as AttendanceStatus) : null),
      notes: notes[s.studentId] ?? s.notes ?? '',
    }));
  }, [data, overrides, notes, isInitialTake]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.studentName.toLowerCase().includes(q) ||
        r.learnerId.toLowerCase().includes(q),
    );
  }, [rows, searchQuery]);

  const {
    paged: pagedRows,
    page,
    setPage,
    pageSize,
    setPageSize,
    total: filteredTotal,
  } = useClientPagination({
    items: filteredRows,
    initialPageSize: REGISTER_PAGE_SIZE,
    resetDeps: [activeSlotId, selectedDate, searchQuery],
  });

  const tally = useMemo(() => {
    const counts: { [K in AttendanceStatus]: number } = {
      present: 0,
      late: 0,
      absent: 0,
    };
    let unset = 0;
    for (const r of rows) {
      if (r.status) counts[r.status as AttendanceStatus]++;
      else unset++;
    }
    return { ...counts, unset, total: rows.length };
  }, [rows]);

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;
  const pageAllSelected =
    pagedRows.length > 0 && pagedRows.every((r) => selectedIds[r.studentId]);
  const filteredAllSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedIds[r.studentId]);

  function setStatus(studentId: string, st: AttendanceStatus) {
    if (alreadySubmitted) return;
    setOverrides((prev) => ({ ...prev, [studentId]: st }));
  }

  function setNote(studentId: string, note: string) {
    if (alreadySubmitted) return;
    setNotes((prev) => ({ ...prev, [studentId]: note }));
  }

  function toggleSelect(studentId: string) {
    setSelectedIds((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  function toggleSelectAllOnPage() {
    const nextValue = !pageAllSelected;
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const r of pagedRows) next[r.studentId] = nextValue;
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    const nextValue = !filteredAllSelected;
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const r of filteredRows) next[r.studentId] = nextValue;
      return next;
    });
  }

  function markBulk(st: AttendanceStatus) {
    if (alreadySubmitted) return;
    const targets =
      selectedCount > 0
        ? rows.filter((r) => selectedIds[r.studentId]).map((r) => r.studentId)
        : filteredRows.map((r) => r.studentId);
    setOverrides((prev) => {
      const next = { ...prev };
      for (const id of targets) next[id] = st;
      return next;
    });
  }

  function handleSaveDraft() {
    if (!activeSlotId || alreadySubmitted) return;
    saveDraftToStorage(activeSlotId, selectedDate, { overrides, notes });
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2500);
  }

  async function handleSubmit() {
    if (!activeSlotId || !data || alreadySubmitted) return;
    setSaveError(null);

    const entries: BulkAttendanceEntry[] = [];
    for (const s of data.students) {
      entries.push({
        studentId: s.studentId,
        status: overrides[s.studentId] ?? s.status ?? 'present',
        notes: notes[s.studentId] || undefined,
      });
    }

    try {
      await saveMutation.mutateAsync({
        timetableSlotId: activeSlotId,
        termId,
        date: selectedDate,
        entries,
      });
      clearDraft(activeSlotId, selectedDate);
      setOverrides({});
      setNotes({});
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to save attendance. Please try again.';
      setSaveError(message);
      const code = (err as { code?: string } | undefined)?.code;
      if (code === 'ALREADY_SUBMITTED') {
        setForceLocked(true);
        setOverrides({});
        setNotes({});
        clearDraft(activeSlotId, selectedDate);
      }
    }
  }

  function onDateChange(next: string) {
    setSelectedDate(next);
    setSelectedSlotId('');
    setOverrides({});
    setNotes({});
    setSelectedIds({});
    setForceLocked(false);
  }

  const bulkTargetLabel =
    selectedCount > 0
      ? `selected (${selectedCount})`
      : searchQuery.trim()
        ? `filtered (${filteredRows.length})`
        : 'all';

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-3 sm:gap-5 sm:p-5 lg:p-6">
      {/* Compact page chrome */}
      <header className="flex flex-col gap-3 border-b border-theme pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-theme-primary sm:text-2xl">
              Attendance
            </h1>
            <nav className="flex gap-1 rounded-lg border border-theme bg-theme-raised/40 p-0.5">
              <Link
                href="/teacher/attendance"
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm',
                  pathname === '/teacher/attendance'
                    ? 'bg-theme-accent text-on-accent shadow-sm'
                    : 'text-theme-muted hover:text-theme-primary',
                ].join(' ')}
              >
                Take
              </Link>
              <Link
                href="/teacher/attendance/history"
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm',
                  pathname === '/teacher/attendance/history'
                    ? 'bg-theme-accent text-on-accent shadow-sm'
                    : 'text-theme-muted hover:text-theme-primary',
                ].join(' ')}
              >
                History
              </Link>
            </nav>
          </div>
          <p className="mt-1 truncate text-xs text-theme-muted sm:text-sm">
            {weekdayLabel(selectedDate)}
            {activeSlot
              ? ` · ${activeSlot.className} · ${activeSlot.subjectName}`
              : ' · Select a period'}
          </p>
        </div>

        <label className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-[11rem]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Date
          </span>
          <input
            type="date"
            max={todayEAT()}
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="ms-input cursor-pointer"
          />
        </label>
      </header>

      {justSaved && (
        <div className="alert-success flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Register submitted for {activeSlot?.className} — {activeSlot?.subjectName}.
        </div>
      )}
      {draftSaved && (
        <div className="alert-info flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium">
          Draft saved on this device. Submit when ready to lock the register.
        </div>
      )}

      {/* Period strip — full width */}
      <section className="rounded-xl border border-theme bg-theme-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-theme px-3 py-2 sm:px-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Periods
          </h2>
          {slots.length > 0 ? (
            <p className="text-xs text-theme-muted">
              {slots.filter((s) => s.alreadySubmitted).length}/{slots.length}{' '}
              submitted
            </p>
          ) : null}
        </div>

        <div className="p-3 sm:p-4">
          {/* Mobile: select */}
          <div className="sm:hidden">
            {isPendingSlots ? (
              <div className="h-10 animate-pulse rounded-lg bg-theme-raised" />
            ) : slots.length === 0 ? (
              <p className="text-sm text-theme-muted">
                No timetable periods for this date.
              </p>
            ) : (
              <select
                className="ms-input w-full"
                value={activeSlotId}
                onChange={(e) => setSelectedSlotId(e.target.value)}
              >
                {slots.map((slot) => (
                  <option key={slot.timetableSlotId} value={slot.timetableSlotId}>
                    {slot.periodNumber != null ? `P${slot.periodNumber} · ` : ''}
                    {slot.subjectName} · {slot.className}
                    {slot.alreadySubmitted ? ' (done)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Desktop/tablet: horizontal chips */}
          <div className="hidden sm:block">
            {isPendingSlots ? (
              <div className="flex gap-2 overflow-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 w-44 shrink-0 animate-pulse rounded-xl bg-theme-raised"
                  />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-theme bg-theme-raised/30 px-6 py-8 text-center">
                <CalendarDays className="h-8 w-8 text-theme-faint" />
                <p className="text-sm font-semibold text-theme-primary">
                  No timetable periods assigned for this date
                </p>
                <p className="text-xs text-theme-muted">
                  Pick another date or check your teaching assignments.
                </p>
              </div>
            ) : (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {slots.map((slot) => {
                  const selected = slot.timetableSlotId === activeSlotId;
                  return (
                    <button
                      key={slot.timetableSlotId}
                      type="button"
                      onClick={() => setSelectedSlotId(slot.timetableSlotId)}
                      className={[
                        'min-w-[11.5rem] max-w-[16rem] shrink-0 rounded-xl border px-3 py-2.5 text-left transition',
                        selected
                          ? 'border-[var(--color-accent)] bg-theme-accent-muted ring-1 ring-theme-accent'
                          : 'border-theme bg-theme-raised/30 hover:bg-theme-raised/60',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[10px] font-medium text-theme-muted">
                          {slotTimeLabel(slot)}
                        </p>
                        <span
                          className={[
                            'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                            slot.alreadySubmitted
                              ? 'badge-success'
                              : 'bg-theme-surface text-theme-muted',
                          ].join(' ')}
                        >
                          {slot.alreadySubmitted ? 'Done' : 'Open'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-theme-primary">
                        {slot.periodNumber != null ? `P${slot.periodNumber} · ` : ''}
                        {slot.subjectName}
                      </p>
                      <p className="truncate text-xs text-theme-muted">
                        {slot.className}
                        {slot.studentCount != null
                          ? ` · ${slot.studentCount}`
                          : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Register — full content width */}
      <section className="min-w-0 flex-1">
        {!activeSlotId && !isPendingSlots ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-theme bg-theme-raised/20 p-10 text-center">
            <Users className="h-10 w-10 text-theme-faint" />
            <p className="text-sm font-semibold text-theme-primary">
              Select a period to open the register
            </p>
          </div>
        ) : isPendingAttendance || (activeSlotId && isPendingSlots) ? (
          <RegisterSkeleton />
        ) : isError ? (
          <div className="alert-error flex flex-col items-center gap-2 rounded-xl p-8 text-center text-sm font-medium">
            <AlertCircle className="h-6 w-6" />
            Failed to load students for this period. Please try again.
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-theme bg-theme-surface p-12 text-center">
            <Users className="h-10 w-10 text-theme-faint" />
            <p className="text-sm font-semibold text-theme-primary">
              No students found in this class
            </p>
            <p className="text-xs text-theme-muted">
              Ensure active students are enrolled and assigned to this class.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
            {alreadySubmitted && (
              <div className="alert-success flex items-start gap-2.5 border-b border-theme px-4 py-3 text-sm">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-medium">
                    Locked — {activeSlot?.className} · {activeSlot?.subjectName}.
                  </span>{' '}
                  <span className="opacity-80">
                    Contact an administrator if a correction is needed.
                  </span>
                </span>
              </div>
            )}

            {/* Sticky toolbar */}
            <div className="sticky top-0 z-20 space-y-3 border-b border-theme bg-theme-surface/95 px-3 py-3 backdrop-blur-sm sm:px-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <AttendanceTallyPill status="present" count={tally.present} />
                  <AttendanceTallyPill status="late" count={tally.late} />
                  <AttendanceTallyPill status="absent" count={tally.absent} />
                  {tally.unset > 0 && (
                    <span className="inline-flex items-center rounded-full border border-theme px-2.5 py-1 text-xs font-semibold text-theme-muted">
                      {tally.unset} unmarked
                    </span>
                  )}
                  <span className="text-xs tabular-nums text-theme-muted">
                    {tally.total} students
                  </span>
                </div>

                <div className="relative w-full lg:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
                  <input
                    type="search"
                    placeholder="Filter name or ID…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="ms-input ms-input-compact w-full pl-9"
                    aria-label="Filter students"
                  />
                </div>
              </div>

              {!alreadySubmitted && (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                      Mark {bulkTargetLabel}
                    </span>
                    {ATTENDANCE_STATUS_KEYS.map((s) => {
                      const cfg = ATTENDANCE_STATUS_STYLE[s];
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => markBulk(s)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${cfg.badge}`}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                    {selectedCount > 0 || searchQuery.trim() ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIds({});
                          setSearchQuery('');
                        }}
                        className="text-xs font-medium text-theme-muted hover:text-theme-primary"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!filteredAllSelected && filteredRows.length > pageSize ? (
                      <button
                        type="button"
                        onClick={toggleSelectAllFiltered}
                        className="text-xs font-medium text-theme-accent hover:underline"
                      >
                        Select all {filteredRows.length} shown
                      </button>
                    ) : null}
                    <div className="hidden items-center gap-2 sm:flex">
                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        className="ms-btn-ghost !px-3 !py-1.5 text-xs"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={saveMutation.isPending}
                        className="ms-btn-primary !px-3 !py-1.5 text-xs"
                      >
                        {saveMutation.isPending ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : null}
                        Submit register
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop / tablet table */}
            <div className="hidden max-h-[min(70vh,720px)] overflow-auto md:block">
              <table className="ms-table ms-table-compact w-full min-w-[40rem]">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="w-10 !px-3">
                      {!alreadySubmitted ? (
                        <input
                          type="checkbox"
                          checked={pageAllSelected}
                          onChange={toggleSelectAllOnPage}
                          className="rounded border-theme"
                          aria-label="Select all on page"
                        />
                      ) : null}
                    </th>
                    <th className="w-12 !px-2">#</th>
                    <th>Student</th>
                    <th className="w-[14rem] sm:w-[16rem] lg:w-[18rem]">
                      Status
                    </th>
                    <th className="min-w-[10rem]">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((student, idx) => (
                    <tr key={student.studentId}>
                      <td className="!px-3">
                        {!alreadySubmitted ? (
                          <input
                            type="checkbox"
                            checked={!!selectedIds[student.studentId]}
                            onChange={() => toggleSelect(student.studentId)}
                            className="rounded border-theme"
                            aria-label={`Select ${student.studentName}`}
                          />
                        ) : null}
                      </td>
                      <td className="!px-2 tabular-nums text-theme-muted">
                        {(page - 1) * pageSize + idx + 1}
                      </td>
                      <td>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-theme-accent-muted text-[10px] font-bold text-theme-accent">
                            {studentInitials(student.studentName)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-theme-primary">
                              {student.studentName}
                            </p>
                            <p className="font-mono text-[11px] text-theme-muted">
                              {student.learnerId}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {alreadySubmitted ? (
                          <AttendanceStatusBadge
                            status={student.status as AttendanceStatus}
                          />
                        ) : (
                          <StatusSegment
                            value={student.status as AttendanceStatus | null}
                            onChange={(st) => setStatus(student.studentId, st)}
                          />
                        )}
                      </td>
                      <td>
                        {alreadySubmitted ? (
                          <span className="line-clamp-2 text-xs italic text-theme-muted">
                            {student.notes || '—'}
                          </span>
                        ) : (
                          <input
                            type="text"
                            placeholder="Note…"
                            value={notes[student.studentId] ?? student.notes ?? ''}
                            onChange={(e) =>
                              setNote(student.studentId, e.target.value)
                            }
                            className="ms-input ms-input-compact w-full max-w-xs text-xs"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile dense list */}
            <ul className="divide-y divide-[var(--color-border)] md:hidden">
              {pagedRows.map((student, idx) => (
                <li key={student.studentId} className="px-3 py-3">
                  <div className="flex items-start gap-2.5">
                    {!alreadySubmitted ? (
                      <input
                        type="checkbox"
                        checked={!!selectedIds[student.studentId]}
                        onChange={() => toggleSelect(student.studentId)}
                        className="mt-1 rounded border-theme"
                      />
                    ) : null}
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-theme-accent-muted text-[10px] font-bold text-theme-accent">
                      {studentInitials(student.studentName)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-theme-primary">
                            <span className="mr-1.5 tabular-nums text-theme-muted">
                              {(page - 1) * pageSize + idx + 1}.
                            </span>
                            {student.studentName}
                          </p>
                          <p className="font-mono text-[11px] text-theme-muted">
                            {student.learnerId}
                          </p>
                        </div>
                        {alreadySubmitted ? (
                          <AttendanceStatusBadge
                            status={student.status as AttendanceStatus}
                            className="shrink-0"
                          />
                        ) : null}
                      </div>
                      {!alreadySubmitted ? (
                        <>
                          <StatusSegment
                            value={student.status as AttendanceStatus | null}
                            onChange={(st) => setStatus(student.studentId, st)}
                            stretch
                          />
                          <input
                            type="text"
                            placeholder="Optional note…"
                            value={notes[student.studentId] ?? student.notes ?? ''}
                            onChange={(e) =>
                              setNote(student.studentId, e.target.value)
                            }
                            className="ms-input ms-input-compact w-full text-xs"
                          />
                        </>
                      ) : student.notes ? (
                        <p className="text-xs italic text-theme-muted">
                          {student.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-theme px-3 py-3 sm:px-4">
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={filteredTotal}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                noun="students"
              />
            </div>

            {saveError && (
              <div className="alert-error mx-3 mb-3 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium sm:mx-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {saveError}
              </div>
            )}

            {/* Mobile sticky actions */}
            {!alreadySubmitted ? (
              <div className="sticky bottom-0 z-20 flex gap-2 border-t border-theme bg-theme-surface/95 p-3 backdrop-blur-sm sm:hidden">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="ms-btn-ghost flex-1"
                >
                  Draft
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={saveMutation.isPending}
                  className="ms-btn-primary flex-[2]"
                >
                  {saveMutation.isPending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : null}
                  Submit
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusSegment({
  value,
  onChange,
  stretch = false,
}: {
  value: AttendanceStatus | null;
  onChange: (st: AttendanceStatus) => void;
  stretch?: boolean;
}) {
  return (
    <div
      className={[
        'inline-flex rounded-lg border border-theme bg-theme-raised/40 p-0.5',
        stretch ? 'w-full' : '',
      ].join(' ')}
      role="group"
      aria-label="Attendance status"
    >
      {ATTENDANCE_STATUS_KEYS.map((s) => {
        const cfg = ATTENDANCE_STATUS_STYLE[s];
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            title={cfg.label}
            onClick={() => onChange(s)}
            className={[
              'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition active:scale-[0.98]',
              stretch ? 'flex-1' : 'min-w-[2.5rem] sm:min-w-[4.5rem]',
              active
                ? cfg.badge
                : 'text-theme-muted hover:bg-theme-surface hover:text-theme-primary',
            ].join(' ')}
          >
            <cfg.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{cfg.label}</span>
            <span className="sm:hidden">{cfg.label.charAt(0)}</span>
          </button>
        );
      })}
    </div>
  );
}

function RegisterSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
      <div className="space-y-3 border-b border-theme px-4 py-3">
        <div className="h-7 w-72 max-w-full animate-pulse rounded-lg bg-theme-raised" />
        <div className="h-9 w-full animate-pulse rounded-lg bg-theme-raised/70" />
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-7 w-7 animate-pulse rounded-full bg-theme-raised" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-40 animate-pulse rounded bg-theme-raised" />
              <div className="h-3 w-24 animate-pulse rounded bg-theme-raised/60" />
            </div>
            <div className="h-8 w-36 animate-pulse rounded-lg bg-theme-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}
