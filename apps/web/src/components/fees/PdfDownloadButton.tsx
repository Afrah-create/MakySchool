"use client";

import { useState } from "react";
import { downloadPdf } from "@/lib/fees/downloadPdf";
import { useToast } from "@/providers/ToastProvider";

export function PdfDownloadButton({
  path,
  label = "PDF",
  className = "text-xs text-theme-accent hover:underline",
}: {
  path: string;
  label?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await downloadPdf(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open PDF.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" className={className} disabled={loading} onClick={() => void handleClick()}>
      {loading ? "Opening…" : label}
    </button>
  );
}
