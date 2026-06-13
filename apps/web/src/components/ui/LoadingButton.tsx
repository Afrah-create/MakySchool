import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils/cn";

type LoadingButtonVariant = "primary" | "danger" | "ghost";

const variantClass: Record<LoadingButtonVariant, string> = {
  primary: "ms-btn-primary",
  danger: "ms-btn-danger",
  ghost: "ms-btn-ghost",
};

export function LoadingButton({
  loading = false,
  loadingLabel,
  variant = "primary",
  children,
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  variant?: LoadingButtonVariant;
  children: ReactNode;
}) {
  const spinnerTone = variant === "primary" || variant === "danger" ? "onAccent" : "accent";

  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(
        variantClass[variant],
        "inline-flex items-center justify-center gap-2 disabled:opacity-60",
        className,
      )}
    >
      {loading ? <Spinner size="sm" tone={spinnerTone} /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
