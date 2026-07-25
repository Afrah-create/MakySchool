'use client';

import { useState } from 'react';
import { Modal } from '@makyschool/ui/components/ui/Modal';
import { StatusBanner } from '@makyschool/ui/components/ui/StatusBanner';
import { useToast } from '@/providers/ToastProvider';
import { useNotifyParent } from '@/hooks/useAttendance';
import { todayEAT } from '@/lib/api/attendance';
import type { StudentAttendanceGuardian } from '@makyschool/shared';

export function NotifyParentPanel({
  open,
  onClose,
  studentId,
  studentName,
  className,
  guardian,
  defaultDate,
  defaultType = 'day_absent',
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  className?: string | null;
  guardian: StudentAttendanceGuardian;
  defaultDate?: string;
  defaultType?: 'period_absent' | 'day_absent' | 'manual';
}) {
  const { toast } = useToast();
  const notify = useNotifyParent();
  const [date, setDate] = useState(defaultDate || todayEAT());
  const [type, setType] = useState<'day_absent' | 'manual'>(
    defaultType === 'period_absent' ? 'day_absent' : defaultType,
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    try {
      const result = await notify.mutateAsync({
        studentId,
        payload: {
          type,
          date,
          message: message.trim() || undefined,
        },
      });
      toast.info(result.message);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to queue parent notification.';
      setError(msg);
      toast.error(msg);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Notify parent"
      description={`Send an attendance notice for ${studentName}${className ? ` (${className})` : ''}.`}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="ms-btn-secondary" onClick={onClose} disabled={notify.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className="ms-btn-primary"
            disabled={notify.isPending || !guardian.canNotify}
            onClick={() => void handleSend()}
          >
            {notify.isPending ? 'Sending…' : 'Send SMS'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {!guardian.canNotify ? (
          <StatusBanner
            tone="error"
            message="No primary guardian phone on file. Add a guardian phone before notifying."
          />
        ) : (
          <div className="rounded-lg border border-theme bg-theme-raised px-3 py-2 text-sm text-theme-muted">
            Recipient: <span className="font-medium text-theme-primary">{guardian.name}</span>
            {' · '}
            {guardian.phone}
          </div>
        )}

        {error ? <StatusBanner tone="error" message={error} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-theme-muted">Absence date</span>
            <input
              type="date"
              max={todayEAT()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ms-input w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-theme-muted">Notice type</span>
            <select
              className="ms-input w-full"
              value={type}
              onChange={(e) => setType(e.target.value as 'day_absent' | 'manual')}
            >
              <option value="day_absent">Missed school day</option>
              <option value="manual">Custom notice</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-theme-muted">
            Message {type === 'manual' ? '(required for custom)' : '(optional override)'}
          </span>
          <textarea
            className="ms-input w-full"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Leave blank to use the standard template."
          />
          <p className="mt-1 text-xs text-theme-faint">{message.length} characters</p>
        </label>

        <p className="text-xs text-theme-muted">
          Notifications are logged for audit and delivered via MakyReach SMS.
        </p>
      </div>
    </Modal>
  );
}
