"use client";

import { useMemo, useState } from "react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { apiClient } from "@/lib/api/client";
import { formatUGX } from "@/lib/formatCurrency";
import type { OutstandingStudent } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

const DEFAULT_TEMPLATE =
  "Dear Parent of {student_name} ({class_name}), school fees for {term_name} are outstanding. Amount due: {balance}. Please pay at the school office. Thank you — {school_name}.";

export function SmsReminderPanel({
  open,
  onClose,
  students,
}: {
  open: boolean;
  onClose: () => void;
  students: OutstandingStudent[];
}) {
  const { toast } = useToast();
  const [message, setMessage] = useState(DEFAULT_TEMPLATE);
  const [loading, setLoading] = useState(false);
  const [makyReachConfigured] = useState(false);

  const charCount = message.length;

  const preview = useMemo(
    () =>
      students.slice(0, 5).map((student) =>
        message
          .replace("{student_name}", student.full_name)
          .replace("{class_name}", student.class_name)
          .replace("{term_name}", student.term_name)
          .replace("{balance}", formatUGX(student.balance))
          .replace("{school_name}", "Your school"),
      ),
    [message, students],
  );

  async function send() {
    setLoading(true);
    try {
      const response = await apiClient<{ queued: number; sent: number; failed: number; message: string }>(
        "/schools/fees/reminders/sms",
        {
          method: "POST",
          body: { message },
        },
      );
      toast.info(response.data.message);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to queue SMS reminders.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Send SMS reminders"
      description={`Send fee reminders to ${students.length} parent${students.length === 1 ? "" : "s"}.`}
      footer={
        <button
          type="button"
          className="ms-btn-primary w-full"
          disabled={loading || !makyReachConfigured || students.length === 0}
          onClick={() => void send()}
        >
          {loading ? "Sending…" : `Send to ${students.length} recipients`}
        </button>
      }
    >
      <div className="space-y-4">
        {!makyReachConfigured ? (
          <div className="rounded-lg border border-theme bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">
            Insufficient MakyReach credits. Purchase more credits to send SMS.
          </div>
        ) : null}

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Recipients</p>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-sm text-theme-muted">
            {students.map((student) => (
              <li key={student.account_id}>
                {student.full_name} · {student.guardian_phone || "No phone"}
              </li>
            ))}
          </ul>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Message</span>
          <textarea className="ms-input w-full" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
          <p className="mt-1 text-xs text-theme-muted">{charCount} / 160 characters</p>
        </label>

        {preview.length > 0 ? (
          <div className="rounded-lg border border-theme bg-theme-surface-raised p-3 text-xs text-theme-muted">
            <p className="mb-2 font-medium text-theme-primary">Preview</p>
            {preview.map((item, index) => (
              <p key={index} className="mb-2 last:mb-0">
                {item}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
