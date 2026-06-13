"use client";

import { useCallback, useState } from "react";
import type { StatusBannerTone } from "@/components/ui/StatusBanner";

export type MutationFeedback = {
  tone: StatusBannerTone;
  message: string;
} | null;

export function useDashboardMutation<TError = unknown>({
  onSuccess,
  parseError,
}: {
  onSuccess?: () => void | Promise<void>;
  parseError?: (error: TError) => string;
}) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<MutationFeedback>(null);

  const dismissFeedback = useCallback(() => setFeedback(null), []);

  const run = useCallback(
    async (action: () => Promise<void>, successMessage?: string) => {
      setLoading(true);
      setFeedback(null);

      try {
        await action();
        await onSuccess?.();
        if (successMessage) {
          setFeedback({ tone: "success", message: successMessage });
        }
      } catch (error) {
        const message = parseError
          ? parseError(error as TError)
          : error instanceof Error
            ? error.message
            : "Something went wrong.";
        setFeedback({ tone: "error", message });
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, parseError],
  );

  return { loading, feedback, dismissFeedback, run, setFeedback };
}
