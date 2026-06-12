import { cn } from "@/lib/utils/cn";

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
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-[0.8125rem] font-medium text-theme-muted">{label}</span>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={cn(
          "ms-input px-4 py-3 shadow-inner shadow-black/20 transition",
          "focus:ring-accent-soft",
          disabled && "cursor-not-allowed opacity-55",
        )}
      />
      {hint ? <span className="mt-2 block text-xs leading-relaxed text-theme-faint">{hint}</span> : null}
    </label>
  );
}

export function AuthAlert({ message, variant = "error" }: { message: string; variant?: "error" | "info" }) {
  return (
    <div
      className={cn(
        "rounded-lg px-4 py-3 text-sm leading-relaxed",
        variant === "error" ? "alert-error" : "alert-info",
      )}
      role="alert"
    >
      {message}
    </div>
  );
}

export function AuthSubmitButton({
  loading,
  children,
  disabled,
}: {
  loading?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="submit" disabled={loading || disabled} className="ms-btn-auth active:scale-[0.99] disabled:active:scale-100">
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-accent/30 border-t-on-accent" />
      ) : null}
      {loading ? "Signing in…" : children}
    </button>
  );
}
