"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

type ToastContextValue = {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
};

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, { icon: typeof CheckCircle2; className: string }> = {
  success: { icon: CheckCircle2, className: "text-theme-success" },
  error: { icon: XCircle, className: "text-theme-danger" },
  warning: { icon: AlertTriangle, className: "text-theme-warning" },
  info: { icon: Info, className: "text-theme-accent" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const duration = toast.duration ?? 4000;
  const { icon: Icon, className } = variantStyles[toast.variant];

  return (
    <div className="relative overflow-hidden rounded-xl border border-theme bg-theme-surface px-4 py-3 shadow-theme-panel">
      <div className="flex items-start gap-3 pr-6">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} />
        <p className="text-sm text-theme-primary">{toast.message}</p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => onDismiss(toast.id)}
          className="absolute right-2 top-2 rounded p-1 text-theme-muted hover:bg-nav-hover"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-theme-accent"
        style={{ animation: `toast-progress ${duration}ms linear forwards` }}
      />
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, duration = 4000) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, message, variant, duration }]);
      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: {
        success: (message, duration) => push("success", message, duration),
        error: (message, duration) => push("error", message, duration),
        warning: (message, duration) => push("warning", message, duration),
        info: (message, duration) => push("info", message, duration),
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((item) => (
          <ToastItem key={item.id} toast={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
