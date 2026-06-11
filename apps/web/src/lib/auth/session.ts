export const TENANT_SLUG_STORAGE_KEY = "makyschool_school_slug";

export function persistSchoolSlug(slug?: string | null) {
  if (typeof window === "undefined" || !slug) {
    return;
  }

  sessionStorage.setItem(TENANT_SLUG_STORAGE_KEY, slug);
  document.body.dataset.schoolSlug = slug;
}

export function clearSchoolSlug() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(TENANT_SLUG_STORAGE_KEY);
  delete document.body.dataset.schoolSlug;
}

export function readStoredSchoolSlug() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return sessionStorage.getItem(TENANT_SLUG_STORAGE_KEY) ?? document.body.dataset.schoolSlug ?? undefined;
}
