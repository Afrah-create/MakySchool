import { CLIENT_APP_HEADER, TENANT_HEADERS } from '@makyschool/shared/constants';
import { resolveClientApiUrl } from '@/lib/api/base-url';
import { readStoredSchoolSlug } from '@/lib/auth/session';

function resolveSchoolSlug() {
  if (typeof document !== 'undefined') {
    return document.body.dataset.schoolSlug || readStoredSchoolSlug() || undefined;
  }
  return readStoredSchoolSlug() || undefined;
}

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1].trim());
    } catch {
      return utfMatch[1].trim();
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

/** POST/GET a binary PDF or ZIP and trigger a browser download. */
export async function downloadBinaryFile(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    fallbackFilename: string;
  },
): Promise<{ filename: string; countHint?: number }> {
  const headers = new Headers();
  const slug = resolveSchoolSlug();
  if (slug) headers.set(TENANT_HEADERS.SCHOOL_SLUG, slug);
  headers.set(CLIENT_APP_HEADER, 'tenant');

  const method = options.method ?? 'GET';
  let body: BodyInit | undefined;
  if (options.body !== undefined && method !== 'GET') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const response = await fetch(resolveClientApiUrl(path), {
    method,
    credentials: 'include',
    headers,
    body,
  });

  if (!response.ok) {
    let message = 'Download failed.';
    try {
      const payload = (await response.json()) as {
        error?: string;
        detail?: { error?: string } | string;
      };
      if (payload.error) message = payload.error;
      else if (typeof payload.detail === 'string') message = payload.detail;
      else if (payload.detail?.error) message = payload.detail.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    throw new Error('Server returned JSON instead of a downloadable file.');
  }

  const filename = filenameFromDisposition(
    response.headers.get('Content-Disposition'),
    options.fallbackFilename,
  );
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('Download was empty. Try again.');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { filename };
}
