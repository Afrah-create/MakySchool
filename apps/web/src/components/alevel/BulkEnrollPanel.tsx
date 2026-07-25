'use client';

import { useMemo, useState } from 'react';
import { Search, UsersRound } from 'lucide-react';
import { Modal } from '@makyschool/ui/components/ui/Modal';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import type { ALevelCombination, ALevelSubject } from '@makyschool/shared';
import { useApiSWR } from '@/hooks/useApiSWR';
import { useToast } from '@/providers/ToastProvider';
import type { StudentsListResponse } from '@/lib/students/types';
import { useBulkCreateALevelEnrollments } from '@/hooks/useALevel';

export function BulkEnrollPanel({
  open,
  onClose,
  classId,
  className,
  academicYearId,
  combinations,
  subsidiaries,
  enrolledStudentIds,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  academicYearId: string;
  combinations: ALevelCombination[];
  subsidiaries: ALevelSubject[];
  enrolledStudentIds: Set<string>;
}) {
  const { toast } = useToast();
  const bulkEnroll = useBulkCreateALevelEnrollments();

  const [combinationId, setCombinationId] = useState('');
  const [subsidiaryId, setSubsidiaryId] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: studentsResp, isLoading } = useApiSWR<StudentsListResponse>(
    open && classId
      ? `/schools/students?class_id=${classId}&status=active&limit=100`
      : null,
  );

  // Students in this class who don't yet have an enrollment for the year.
  const available = useMemo(() => {
    const rows = (studentsResp?.students ?? []).filter(
      (s) => !enrolledStudentIds.has(s.id),
    );
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (s) =>
        s.full_name.toLowerCase().includes(term) ||
        s.learner_id.toLowerCase().includes(term),
    );
  }, [studentsResp, enrolledStudentIds, search]);

  const allVisibleSelected =
    available.length > 0 && available.every((s) => selected.has(s.id));

  function reset() {
    setCombinationId('');
    setSubsidiaryId('');
    setSearch('');
    setSelected(new Set());
  }

  function close() {
    reset();
    onClose();
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const s of available) next.delete(s.id);
      } else {
        for (const s of available) next.add(s.id);
      }
      return next;
    });
  }

  async function submit() {
    if (!combinationId) {
      toast.error('Select a combination first.');
      return;
    }
    if (selected.size === 0) {
      toast.error('Select at least one student.');
      return;
    }
    try {
      const result = await bulkEnroll.mutateAsync({
        studentIds: [...selected],
        combinationId,
        academicYearId,
        classId,
        subsidiarySubjectId: subsidiaryId || null,
      });
      const combo = combinations.find((c) => c.id === combinationId);
      toast.success(
        `Enrolled ${result.enrolled} student${result.enrolled === 1 ? '' : 's'} into ${combo?.name ?? 'the combination'}.`,
      );
      if (result.skipped > 0) {
        toast.info(
          `${result.skipped} student${result.skipped === 1 ? ' was' : 's were'} already enrolled this year and ${result.skipped === 1 ? 'was' : 'were'} skipped.`,
        );
      }
      if (result.invalid > 0) {
        toast.warning(
          `${result.invalid} student${result.invalid === 1 ? '' : 's'} could not be enrolled (inactive or not found).`,
        );
      }
      close();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not enroll students.',
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Bulk enroll students"
      description={`Assign one combination to many students in ${className}.`}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-theme-muted">
            {selected.size} selected
          </p>
          <div className="flex gap-3">
            <button type="button" className="ms-btn-ghost" onClick={close}>
              Cancel
            </button>
            <LoadingButton
              variant="primary"
              loading={bulkEnroll.isPending}
              onClick={() => void submit()}
            >
              Enroll {selected.size > 0 ? selected.size : ''} student
              {selected.size === 1 ? '' : 's'}
            </LoadingButton>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Combination
            </span>
            <select
              className="ms-input w-full"
              value={combinationId}
              onChange={(e) => setCombinationId(e.target.value)}
            >
              <option value="">Select a combination…</option>
              {combinations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.category})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Subsidiary subject (optional)
            </span>
            <select
              className="ms-input w-full"
              value={subsidiaryId}
              onChange={(e) => setSubsidiaryId(e.target.value)}
            >
              <option value="">None</option>
              {subsidiaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="border-t border-theme pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-theme-primary">
              Students ({available.length} available)
            </span>
            {available.length > 0 ? (
              <button
                type="button"
                className="text-xs font-semibold text-theme-accent hover:underline"
                onClick={toggleAllVisible}
              >
                {allVisibleSelected ? 'Clear all' : 'Select all'}
              </button>
            ) : null}
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
            <input
              className="ms-input w-full pl-9"
              placeholder="Search by name or learner ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : available.length === 0 ? (
            <div className="rounded-xl border border-dashed border-theme px-4 py-8 text-center">
              <UsersRound className="mx-auto mb-2 h-6 w-6 text-theme-faint" />
              <p className="text-sm text-theme-muted">
                {search.trim()
                  ? 'No students match your search.'
                  : 'Every active student in this class is already enrolled.'}
              </p>
            </div>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-theme p-2">
              {available.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-theme-raised/40">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-theme-primary">
                        {s.full_name}
                      </span>
                      <span className="block font-mono text-[11px] text-theme-muted">
                        {s.learner_id}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
