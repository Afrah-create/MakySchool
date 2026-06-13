"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { RefreshingBadge } from "@/components/ui/RefreshingBadge";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { useDelayedTrue } from "@/hooks/useDelayedTrue";

type QueryStateProps<T> = {
  isLoading: boolean;
  isValidating?: boolean;
  error?: unknown;
  data: T | undefined;
  isEmpty?: (data: T) => boolean;
  onRetry?: () => void;
  loading?: ReactNode;
  empty?: ReactNode;
  errorView?: ReactNode;
  slowAfterMs?: number;
  slowMessage?: string;
  showRefreshing?: boolean;
  header?: ReactNode;
  children: (data: T) => ReactNode;
};

function defaultErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong while loading data.";
}

export function QueryState<T>({
  isLoading,
  isValidating = false,
  error,
  data,
  isEmpty,
  onRetry,
  loading,
  empty,
  errorView,
  slowAfterMs = 4000,
  slowMessage = "This is taking longer than usual. Check your connection or try again.",
  showRefreshing = true,
  header,
  children,
}: QueryStateProps<T>) {
  const isSlow = useDelayedTrue(isLoading, slowAfterMs);
  const showRefreshBadge = showRefreshing && isValidating && !isLoading && data !== undefined;

  if (isLoading && data === undefined) {
    return (
      <div aria-busy="true" className="space-y-3">
        {loading}
        {isSlow ? (
          <div className="space-y-3">
            <StatusBanner tone="info" message={slowMessage} />
            {onRetry ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onRetry}
                  className="ms-btn-ghost rounded-lg px-4 py-2 text-sm"
                >
                  Try again
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (error && data === undefined) {
    return (
      errorView ?? (
        <EmptyState
          variant="error"
          title="Unable to load content"
          description={defaultErrorMessage(error)}
          onRetry={onRetry}
        />
      )
    );
  }

  if (data !== undefined && isEmpty?.(data)) {
    return empty ?? null;
  }

  if (data === undefined) {
    return null;
  }

  return (
    <div className="space-y-3">
      {header || showRefreshBadge ? (
        <div className="flex items-center justify-end gap-2">
          {header}
          {showRefreshBadge ? <RefreshingBadge /> : null}
        </div>
      ) : null}
      {children(data)}
    </div>
  );
}
