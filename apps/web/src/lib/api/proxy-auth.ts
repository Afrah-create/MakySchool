import { TENANT_HEADERS } from "@makyschool/shared/constants";
import { getServerApiBaseUrl } from "@/lib/api/base-url";

const FORWARD_REQUEST_HEADERS = [
  "content-type",
  "accept",
  TENANT_HEADERS.SCHOOL_SLUG.toLowerCase(),
  TENANT_HEADERS.SCHOOL_ID.toLowerCase(),
] as const;

function buildUpstreamUrl(pathSegments: string[]) {
  const base = getServerApiBaseUrl();
  const suffix = pathSegments.length ? `/${pathSegments.join("/")}` : "";
  return `${base}/auth${suffix}`;
}

export async function proxyAuthRequest(request: Request, pathSegments: string[]) {
  const upstreamUrl = buildUpstreamUrl(pathSegments);
  const headers = new Headers();

  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  const cookie = request.headers.get("cookie");
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    responseHeaders.set("content-type", contentType);
  }

  for (const cookieValue of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookieValue);
  }

  const responseBody = await upstream.arrayBuffer();

  return new Response(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
