import { CLIENT_APP_HEADER, TENANT_HEADERS } from "@makyschool/shared/constants";
import { resolveClientApiUrl } from "@/lib/api/base-url";
import { readStoredSchoolSlug } from "@/lib/auth/session";

function resolveSchoolSlug() {
  if (typeof document !== "undefined") {
    return document.body.dataset.schoolSlug || readStoredSchoolSlug() || undefined;
  }
  return readStoredSchoolSlug() || undefined;
}

/** Fetch a PDF with tenant auth headers and open it in a new tab. */
export async function downloadPdf(path: string): Promise<void> {
  const headers = new Headers();
  const slug = resolveSchoolSlug();
  if (slug) {
    headers.set(TENANT_HEADERS.SCHOOL_SLUG, slug);
  }
  headers.set(CLIENT_APP_HEADER, "tenant");

  const response = await fetch(resolveClientApiUrl(path), {
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new Error("Failed to download PDF.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank");
}
