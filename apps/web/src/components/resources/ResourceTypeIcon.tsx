"use client";

import { FileText, Film, File, FolderOpen } from "lucide-react";
import type { SubjectResourceType } from "@makyschool/shared";

const ICONS = {
  pdf: FileText,
  video: Film,
  document: File,
  other: FolderOpen,
} as const;

export function ResourceTypeIcon({
  type,
  className = "h-5 w-5",
}: {
  type?: SubjectResourceType | string | null;
  className?: string;
}) {
  const key = (type as SubjectResourceType) || "other";
  const Icon = ICONS[key] ?? FolderOpen;
  return <Icon className={className} aria-hidden />;
}
