"use client";

import { FileUpload } from "@/components/ui/FileUpload";

type ProfileValue = {
  name: string;
  logo: File | null;
  stamp: File | null;
  email: string;
  phone: string;
  address: string;
  schoolType: string;
};

const labelClass = "mb-2 block text-sm font-medium text-theme-muted";

export function ProfileStep({
  value,
  onChange,
}: {
  value: ProfileValue;
  onChange: (next: ProfileValue) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <label className="block lg:col-span-2">
        <span className={labelClass}>School name</span>
        <input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          className="ms-input"
        />
      </label>

      <FileUpload
        label="Logo"
        helperText="JPEG, PNG, or WebP. Max 2 MB."
        accept="image/jpeg,image/png,image/webp"
        onChange={(file) => onChange({ ...value, logo: file })}
      />
      <FileUpload
        label="School stamp"
        helperText="JPEG, PNG, or WebP. Max 2 MB."
        accept="image/jpeg,image/png,image/webp"
        onChange={(file) => onChange({ ...value, stamp: file })}
      />

      <label className="block">
        <span className={labelClass}>Official email</span>
        <input
          type="email"
          value={value.email}
          onChange={(event) => onChange({ ...value, email: event.target.value })}
          className="ms-input"
        />
      </label>
      <label className="block">
        <span className={labelClass}>Phone number</span>
        <input
          value={value.phone}
          onChange={(event) => onChange({ ...value, phone: event.target.value })}
          className="ms-input"
        />
      </label>
      <label className="block lg:col-span-2">
        <span className={labelClass}>Physical address</span>
        <textarea
          value={value.address}
          onChange={(event) => onChange({ ...value, address: event.target.value })}
          rows={3}
          className="ms-input"
        />
      </label>

      <div className="lg:col-span-2">
        <p className={labelClass}>School type</p>
        <div className="flex flex-wrap gap-3">
          {(["primary", "secondary", "both"] as const).map((type) => (
            <label
              key={type}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm capitalize transition ${
                value.schoolType === type
                  ? "border-accent-soft bg-theme-accent-muted text-theme-primary"
                  : "border-theme text-theme-muted hover:border-theme-strong"
              }`}
            >
              <input
                type="radio"
                name="schoolType"
                className="sr-only"
                checked={value.schoolType === type}
                onChange={() => onChange({ ...value, schoolType: type })}
              />
              {type}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
