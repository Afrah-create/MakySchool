"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function AuthInput({
  id,
  label,
  type = "text",
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  hint,
  icon: Icon,
  error,
}: {
  id: string;
  label: string;
  type?: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  icon?: LucideIcon;
  error?: string | null;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-[0.8125rem] font-medium text-theme-muted">{label}</span>
      <div className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
        ) : null}
        <input
          id={id}
          name={name}
          type={inputType}
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            "ms-input auth-input-field py-3 transition",
            Icon && "pl-10",
            isPassword && "pr-11",
            error && "border-red-400 focus:border-red-400",
            disabled && "cursor-not-allowed opacity-55",
          )}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-theme-muted transition hover:bg-nav-hover hover:text-theme-primary"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      {error ? (
        <span id={`${id}-error`} className="mt-2 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="mt-2 block text-xs leading-relaxed text-theme-faint">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** @deprecated Use AuthInput instead. */
export function AuthField({
  id,
  label,
  type = "text",
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <AuthInput
      id={id}
      label={label}
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      placeholder={placeholder}
      disabled={disabled}
      hint={hint}
    />
  );
}

export function AuthAlert({
  message,
  variant = "error",
}: {
  message: string;
  variant?: "error" | "info";
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-4 py-3 text-sm leading-relaxed",
        variant === "error" ? "alert-error auth-shake" : "alert-info",
      )}
      role="alert"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export function AuthSubmitButton({
  loading,
  children,
  disabled,
  loadingLabel = "Signing in…",
}: {
  loading?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  loadingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="ms-btn-auth active:scale-[0.99] disabled:active:scale-100"
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-accent/30 border-t-on-accent" />
      ) : null}
      {loading ? loadingLabel : children}
    </button>
  );
}

export function AuthSecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ms-btn-ghost w-full rounded-xl py-3"
    >
      {children}
    </button>
  );
}

export function AuthStepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, index) => {
        const stepNumber = index + 1;
        const active = stepNumber <= current;
        return (
          <span
            key={stepNumber}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              active ? "bg-theme-accent" : "bg-theme-icon",
            )}
            aria-current={stepNumber === current ? "step" : undefined}
          />
        );
      })}
    </div>
  );
}
