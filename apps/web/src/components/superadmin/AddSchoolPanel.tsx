"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  Mail,
  Plus,
  User,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { SlideOver } from "@/components/ui/SlideOver";

type ProvisionResponse = {
  school: { id: string; slug: string; name: string };
  admin: { email: string };
  tempPassword: string;
};

function Field({
  id,
  label,
  name,
  type = "text",
  placeholder,
  hint,
  icon: Icon,
}: {
  id: string;
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  icon: typeof Building2;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-xs font-medium text-theme-muted">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
        <input
          id={id}
          name={name}
          type={type}
          required
          placeholder={placeholder}
          className="ms-input pl-10"
        />
      </div>
      {hint ? <p className="mt-1.5 text-xs text-theme-faint">{hint}</p> : null}
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-theme-primary">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-theme-muted">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function CopyButton({
  label,
  value,
  copiedLabel = "Copied",
  className = "",
}: {
  label: string;
  value: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-theme px-3 py-2 text-xs font-medium text-theme-accent transition hover:bg-theme-accent-muted ${className}`}
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? copiedLabel : label}
    </button>
  );
}

function SuccessView({
  data,
  onDone,
}: {
  data: ProvisionResponse;
  onDone: () => void;
}) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "makyschool.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${rootDomain}`;
  const isLocal = appUrl.includes("localhost");
  const loginUrl = isLocal
    ? `${appUrl.replace(/\/$/, "")}/login`
    : `https://${data.school.slug}.${rootDomain}/login`;

  const credentialsText = [
    `School: ${data.school.name}`,
    `Slug: ${data.school.slug}`,
    `Login URL: ${loginUrl}`,
    `Admin email: ${data.admin.email}`,
    `Temporary password: ${data.tempPassword}`,
  ].join("\n");

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <div className="badge-success flex h-12 w-12 items-center justify-center rounded-full">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-theme-primary">School provisioned</h3>
        <p className="mt-1 text-sm text-theme-muted">
          Share the credentials below with the school administrator.
        </p>
      </div>

      <div className="rounded-xl border border-theme bg-input divide-y divide-theme">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-theme-muted">School</p>
            <p className="truncate text-sm font-medium text-theme-primary">{data.school.name}</p>
          </div>
          <span className="badge-info shrink-0 rounded-full px-2.5 py-0.5 font-mono text-xs">
            {data.school.slug}
          </span>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-theme-muted">Admin email</p>
          <p className="mt-0.5 text-sm text-theme-primary">{data.admin.email}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-theme-muted">Login URL</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-theme-surface px-3 py-2 font-mono text-xs text-theme-primary">
              {loginUrl}
            </code>
            <CopyButton label="Copy" value={loginUrl} />
          </div>
        </div>
      </div>

      <div className="badge-warning rounded-xl p-4">
        <p className="text-xs font-medium uppercase tracking-wide">
          Temporary password
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded-lg border border-theme bg-input px-3 py-2.5 font-mono text-sm tracking-wide text-theme-primary">
            {data.tempPassword}
          </code>
          <CopyButton label="Copy" value={data.tempPassword} />
        </div>
        <p className="mt-3 text-xs leading-relaxed opacity-80">
          This password is shown once. The admin must change it on first sign-in.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <CopyButton
          label="Copy all credentials"
          value={credentialsText}
          copiedLabel="All copied"
          className="flex-1 py-2.5 text-sm"
        />
        <button
          type="button"
          onClick={onDone}
          className="ms-btn-primary flex-1"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export function AddSchoolPanel({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ProvisionResponse | null>(null);

  function resetPanel() {
    setError(null);
    setSuccess(null);
    setLoading(false);
  }

  function handleClose() {
    setOpen(false);
    resetPanel();
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    try {
      const payload = {
        schoolName: String(formData.get("schoolName") ?? "").trim(),
        adminName: String(formData.get("adminName") ?? "").trim(),
        adminEmail: String(formData.get("adminEmail") ?? "").trim(),
      };

      const response = await apiClient<ProvisionResponse>("/superadmin/schools", {
        method: "POST",
        body: payload,
      });

      setSuccess(response.data);
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to provision school");
    } finally {
      setLoading(false);
    }
  }

  const formFooter = !success ? (
    <div className="flex items-center justify-end gap-3">
      <button type="button" onClick={handleClose} className="ms-btn-ghost">
        Cancel
      </button>
      <button
        form="provision-school-form"
        disabled={loading}
        type="submit"
        className="ms-btn-primary min-w-[8.5rem]"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Provisioning…
          </span>
        ) : (
          "Provision school"
        )}
      </button>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        id="add-school-trigger"
        onClick={() => {
          resetPanel();
          setOpen(true);
        }}
        className="inline-flex shrink-0 items-center gap-2 ms-btn-primary px-4 py-2.5"
      >
        <Plus className="h-4 w-4" />
        Add school
      </button>

      <SlideOver
        open={open}
        onClose={handleClose}
        title={success ? "School ready" : "Add school"}
        description={
          success
            ? undefined
            : "Create a new tenant school and issue a one-time admin password."
        }
        footer={formFooter}
      >
        {success ? (
          <SuccessView
            data={success}
            onDone={() => {
              handleClose();
              onCreated();
            }}
          />
        ) : (
          <form
            id="provision-school-form"
            className="space-y-8"
            action={(formData) => {
              void handleSubmit(formData);
            }}
          >
            <Section
              title="School details"
              description="A URL-safe slug is generated automatically from the school name."
            >
              <Field
                id="schoolName"
                name="schoolName"
                label="School name"
                placeholder="e.g. Easton High School"
                icon={Building2}
              />
            </Section>

            <div className="h-px bg-theme-icon" />

            <Section
              title="Administrator account"
              description="This person will complete the setup wizard on first login."
            >
              <Field
                id="adminName"
                name="adminName"
                label="Full name"
                placeholder="e.g. Jane Nakato"
                icon={User}
              />
              <Field
                id="adminEmail"
                name="adminEmail"
                type="email"
                label="Email address"
                placeholder="admin@school.ug"
                hint="Used to sign in. Must be unique across schools."
                icon={Mail}
              />
            </Section>

            {error ? (
              <div
                role="alert"
                className="alert-error rounded-lg px-4 py-3 text-sm"
              >
                {error}
              </div>
            ) : null}
          </form>
        )}
      </SlideOver>
    </>
  );
}
