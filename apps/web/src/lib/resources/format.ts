export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatShortDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const PLAN_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const RESOURCE_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mov,.avi,.mkv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska";

export const MAX_PLAN_BYTES = 50 * 1024 * 1024;
export const MAX_RESOURCE_DOC_BYTES = 100 * 1024 * 1024;
export const MAX_RESOURCE_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
]);

export function validatePlanFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!/\.(pdf|doc|docx)$/.test(name)) {
    return "Teaching plans must be PDF, DOC, or DOCX.";
  }
  if (file.size > MAX_PLAN_BYTES) {
    return "Teaching plan exceeds the 50MB limit.";
  }
  return null;
}

export function validateResourceFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!/\.(pdf|doc|docx|ppt|pptx|mp4|mov|avi|mkv)$/.test(name)) {
    return "This file type is not allowed.";
  }
  const isVideo = VIDEO_TYPES.has(file.type) || /\.(mp4|mov|avi|mkv)$/.test(name);
  const limit = isVideo ? MAX_RESOURCE_VIDEO_BYTES : MAX_RESOURCE_DOC_BYTES;
  const label = isVideo ? "2GB" : "100MB";
  if (file.size > limit) {
    return `File exceeds the ${label} limit.`;
  }
  return null;
}
