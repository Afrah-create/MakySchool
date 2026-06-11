"use client";

import type { ReactNode } from "react";

export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/45 p-0 sm:p-4">
      <button aria-label="Close panel" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 px-6 py-6">{children}</div>
      </aside>
    </div>
  );
}