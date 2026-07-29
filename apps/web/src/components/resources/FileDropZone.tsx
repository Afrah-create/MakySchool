"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { formatBytes } from "@/lib/resources/format";

type FileDropZoneProps = {
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  helperText?: string;
  disabled?: boolean;
};

export function FileDropZone({
  accept,
  file,
  onChange,
  helperText,
  disabled,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(list: FileList | null) {
    const next = list?.[0] ?? null;
    onChange(next);
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) pick(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition ${
          dragging
            ? "border-theme-accent bg-theme-accent/5"
            : "border-theme bg-theme-raised/30 hover:bg-theme-raised/50"
        } disabled:opacity-60`}
      >
        <Upload className="h-6 w-6 text-theme-muted" />
        <p className="text-sm font-medium text-theme-primary">
          {file ? file.name : "Drop a file here or click to browse"}
        </p>
        {file ? (
          <p className="text-xs text-theme-muted">{formatBytes(file.size)}</p>
        ) : helperText ? (
          <p className="text-xs text-theme-muted">{helperText}</p>
        ) : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      {file ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-theme-muted underline hover:text-theme-primary"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          Clear selection
        </button>
      ) : null}
    </div>
  );
}
