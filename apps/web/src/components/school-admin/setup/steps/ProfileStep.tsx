"use client";

import { Plus, X } from "lucide-react";
import { FileUpload } from "@makyschool/ui/components/ui/FileUpload";

export type ProfileValue = {
  name: string;
  logo: File | null;
  stamp: File | null;
  emails: string[];
  phones: string[];
  address: string;
  schoolType: string;
  theologyEnabled: boolean;
};


const labelClass = "mb-2 block text-sm font-medium text-theme-muted";

function ContactListEditor({
  label,
  values,
  type,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  type: "email" | "tel" | "text";
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const rows = values.length ? values : [""];

  function updateAt(index: number, value: string) {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  }

  function addRow() {
    onChange([...rows, ""]);
  }

  function removeAt(index: number) {
    if (rows.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="block lg:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={labelClass + " mb-0"}>{label}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-theme-accent hover:underline"
          onClick={addRow}
        >
          <Plus className="h-3.5 w-3.5" />
          Add another
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((value, index) => (
          <div key={`${label}-${index}`} className="flex gap-2">
            <input
              type={type}
              value={value}
              placeholder={placeholder}
              onChange={(event) => updateAt(index, event.target.value)}
              className="ms-input flex-1"
            />
            <button
              type="button"
              className="ms-btn-ghost px-2"
              title="Remove"
              onClick={() => removeAt(index)}
              disabled={rows.length === 1 && !value}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileStep({
  value,
  onChange,
  lockSchoolType = false,
}: {
  value: ProfileValue;
  onChange: (next: ProfileValue) => void;
  /** When true, school type is shown read-only (post-setup). */
  lockSchoolType?: boolean;
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

      <ContactListEditor
        label="Email addresses"
        values={value.emails}
        type="email"
        placeholder="office@school.ug"
        onChange={(emails) => onChange({ ...value, emails })}
      />
      <ContactListEditor
        label="Phone numbers"
        values={value.phones}
        type="tel"
        placeholder="+256 700 000 000"
        onChange={(phones) => onChange({ ...value, phones })}
      />

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
        {lockSchoolType ? (
          <div className="rounded-lg border border-theme bg-theme-raised/50 px-4 py-2.5 text-sm capitalize text-theme-primary">
            {value.schoolType || "—"}
            <p className="mt-1 text-xs font-normal normal-case text-theme-muted">
              Set during setup and cannot be changed afterwards.
            </p>
          </div>
        ) : (
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
        )}
      </div>

      <div className="lg:col-span-2">
        <p className={labelClass}>Theology</p>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-theme px-4 py-2.5 text-sm text-theme-muted hover:border-theme-strong">
          <input
            type="checkbox"
            checked={value.theologyEnabled}
            onChange={(event) => onChange({ ...value, theologyEnabled: event.target.checked })}
          />
          This school teaches theology (e.g. Qur&apos;an, Fiqh, Hadith) alongside the secular curriculum
        </label>
      </div>
    </div>
  );
}