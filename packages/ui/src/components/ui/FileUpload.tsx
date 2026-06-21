"use client";

import { useEffect, useMemo, useState } from "react";

export function FileUpload({
  label,
  helperText,
  onChange,
  accept = "image/*",
}: {
  label: string;
  helperText?: string;
  onChange: (file: File | null) => void;
  accept?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-theme-muted">{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          setFile(selected);
          onChange(selected);
        }}
        className="ms-input file:mr-4 file:rounded-lg file:border-0 file:bg-theme-icon file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-theme-primary"
      />
      {helperText ? <p className="mt-2 text-xs text-theme-faint">{helperText}</p> : null}
      {previewUrl ? (
        <img src={previewUrl} alt="Preview" className="mt-3 h-24 w-24 rounded-xl border border-theme object-cover" />
      ) : null}
    </label>
  );
}
