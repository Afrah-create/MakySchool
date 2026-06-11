import Link from "next/link";
import { cn } from "@/lib/utils/cn";

const highlights = [
  "One secure sign-in for platform and school roles",
  "Role-based access to dashboards and tools",
  "School provisioning managed by platform administrators",
];

type AuthShellProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthShell({ children, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-950 px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-20 top-16 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.04)_0%,transparent_45%)]" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-sm font-bold ring-1 ring-white/15 backdrop-blur-sm">
              MS
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight">MakySchool</p>
              <p className="text-xs uppercase tracking-[0.24em] text-indigo-200/80">Unified access</p>
            </div>
          </Link>
          <h2 className="mt-12 max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Sign in once. Access what your role allows.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-indigo-100/80">
            Platform administrators and school teams use the same login. Your credentials determine
            whether you manage the platform or configure your school workspace.
          </p>
        </div>

        <ul className="relative space-y-4">
          {highlights.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-indigo-50/90">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
              {item}
            </li>
          ))}
        </ul>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.08),transparent_35%)] lg:hidden" />

        <div className="relative w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-700 text-xs font-bold text-white">
                MS
              </span>
              MakySchool
            </Link>
          </div>

          <div className="rounded-[1.85rem] border border-slate-200/80 bg-white/95 p-8 shadow-2xl shadow-slate-300/30 backdrop-blur-sm">
            <div className="mb-8 text-center lg:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-700">Secure sign in</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enter your credentials to continue. Access is granted based on your assigned role.
              </p>
            </div>

            {children}
          </div>

          {footer ? <div className="mt-6 text-center text-sm text-slate-500">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

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
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
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
          "w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-900 outline-none transition",
          "placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100",
          disabled && "cursor-not-allowed opacity-60",
        )}
      />
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function AuthAlert({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-700/20 transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
      ) : null}
      {children}
    </button>
  );
}
