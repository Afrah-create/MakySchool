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
      <span className="mb-2 block text-[0.8125rem] font-medium text-[#8B90A7]">{label}</span>
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
          "w-full rounded-lg border border-[#252A3A] bg-[#0F1117] px-4 py-3 text-sm text-[#F0F2FA] shadow-inner shadow-black/20 outline-none transition",
          "placeholder:text-[#3D4357] focus:border-[#4F6EF7] focus:ring-2 focus:ring-[#4F6EF7]/20",
          disabled && "cursor-not-allowed opacity-55",
        )}
      />
      {hint ? <span className="mt-2 block text-xs leading-relaxed text-[#3D4357]">{hint}</span> : null}
    </label>
  );
}

export function AuthAlert({ message, variant = "error" }: { message: string; variant?: "error" | "info" }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm leading-relaxed",
        variant === "error"
          ? "border-rose-500/25 bg-rose-500/[0.08] text-rose-200"
          : "border-[#252A3A] bg-[#0F1117] text-[#8B90A7]",
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
    <button
      type="submit"
      disabled={loading || disabled}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-[#4F6EF7] py-3 text-sm font-semibold text-white shadow-md shadow-[#4F6EF7]/25 transition hover:bg-[#3D5CE6] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:scale-100"
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : null}
      {loading ? "Signing in…" : children}
    </button>
  );
}
