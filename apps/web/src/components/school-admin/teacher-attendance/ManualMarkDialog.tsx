'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@makyschool/ui/components/ui/Modal';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { useToast } from '@/providers/ToastProvider';
import { useManualMarkTeacherAttendance } from '@/hooks/useTeacherAttendance';

export function ManualMarkDialog({
  open,
  onClose,
  teacherId,
  teacherName,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  teacherId: string;
  teacherName: string;
  defaultDate?: string;
}) {
  const { toast } = useToast();
  const mark = useManualMarkTeacherAttendance();
  const [date, setDate] = useState(
    defaultDate || new Date().toISOString().slice(0, 10),
  );
  const [status, setStatus] = useState<'present' | 'late' | 'absent'>('present');
  const [clockIn, setClockIn] = useState('08:00');
  const [clockOut, setClockOut] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setDate(defaultDate || new Date().toISOString().slice(0, 10));
      setStatus('present');
      setClockIn('08:00');
      setClockOut('');
      setReason('');
    }
  }, [open, defaultDate]);

  async function save() {
    if (!reason.trim()) {
      toast.error('A reason is required for manual entries.');
      return;
    }
    try {
      const res = await mark.mutateAsync({
        teacher_id: teacherId,
        date,
        status,
        reason: reason.trim(),
        clock_in_time: status === 'absent' ? null : clockIn || null,
        clock_out_time: clockOut || null,
      });
      toast.success(res.message || `${teacherName} marked as ${status}.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manual attendance entry" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-theme bg-theme-warning-bg px-3 py-2.5 text-sm text-theme-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Manual entries override GPS attendance records.</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Teacher
          </p>
          <p className="mt-1 font-medium text-theme-primary">{teacherName}</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Date
          </span>
          <input
            type="date"
            className="ms-input w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Status
          </legend>
          <div className="flex flex-wrap gap-3">
            {(['present', 'late', 'absent'] as const).map((s) => (
              <label key={s} className="inline-flex items-center gap-2 text-sm capitalize">
                <input
                  type="radio"
                  name="manual-status"
                  checked={status === s}
                  onChange={() => setStatus(s)}
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>

        {status !== 'absent' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Clock-in time
              </span>
              <input
                type="time"
                className="ms-input w-full"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Clock-out time
              </span>
              <input
                type="time"
                className="ms-input w-full"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Reason for manual entry
          </span>
          <textarea
            className="ms-input min-h-[88px] w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Official duty off-site"
            required
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <LoadingButton variant="ghost" onClick={onClose}>
            Cancel
          </LoadingButton>
          <LoadingButton
            variant="primary"
            loading={mark.isPending}
            onClick={() => void save()}
          >
            Save manual entry
          </LoadingButton>
        </div>
      </div>
    </Modal>
  );
}
