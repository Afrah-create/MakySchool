"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock, Mail } from "lucide-react";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { apiClient } from "@/lib/api/client";

type LoginResponse = {
  accountType: "platform";
  role: string;
  redirectTo: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function PlatformLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Enter a valid email address");
      return;
    }

    if (!password) {
      setError("Enter your password");
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient<LoginResponse>("/superadmin/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
        clientApp: "platform",
      });

      router.push(response.data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch (submissionError) {
      const err = submissionError as Error;
      setError(err.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-theme-page">
      <header className="flex items-center justify-end px-6 py-4">
        <ThemeToggle />
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-theme bg-theme-surface p-8 shadow-sm">
          <div className="mb-8 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent text-sm font-bold text-on-accent">
              MS
            </span>
            <h1 className="mt-4 text-xl font-semibold text-theme-primary">Platform admin</h1>
            <p className="mt-1 text-sm text-theme-muted">
              Sign in to manage schools on MakySchool.
            </p>
          </div>

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-theme-muted">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  className="ms-input w-full pl-10"
                  placeholder="admin@makyschool.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-theme-muted">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="ms-input w-full pl-10"
                />
              </div>
            </label>

            {error ? (
              <p className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="ms-btn-primary w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
