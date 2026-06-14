type CookieSetOptions = {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
};

function parseSetCookieHeader(header: string) {
  const segments = header.split(";").map((part) => part.trim());
  const nameValue = segments[0] ?? "";
  const eqIndex = nameValue.indexOf("=");

  if (eqIndex <= 0) {
    return null;
  }

  const name = nameValue.slice(0, eqIndex);
  const value = nameValue.slice(eqIndex + 1);
  const options: CookieSetOptions = { path: "/" };

  for (const segment of segments.slice(1)) {
    const lower = segment.toLowerCase();

    if (lower === "httponly") {
      options.httpOnly = true;
      continue;
    }

    if (lower === "secure") {
      options.secure = true;
      continue;
    }

    const attrEq = segment.indexOf("=");
    const key = (attrEq === -1 ? segment : segment.slice(0, attrEq)).trim().toLowerCase();
    const attrValue = attrEq === -1 ? "" : segment.slice(attrEq + 1).trim();

    if (key === "path" && attrValue) {
      options.path = attrValue;
    } else if (key === "max-age" && attrValue) {
      options.maxAge = Number(attrValue);
    } else if (key === "samesite" && attrValue) {
      const sameSite = attrValue.toLowerCase();
      if (sameSite === "lax" || sameSite === "strict" || sameSite === "none") {
        options.sameSite = sameSite;
      }
    }
  }

  return { name, value, options };
}

export function applyUpstreamSetCookies(
  response: Response,
  cookieStore: { set: (name: string, value: string, options?: CookieSetOptions) => void; delete: (name: string) => void },
) {
  for (const header of response.headers.getSetCookie()) {
    const parsed = parseSetCookieHeader(header);
    if (!parsed) {
      continue;
    }

    if (parsed.options?.maxAge === 0) {
      cookieStore.delete(parsed.name);
      continue;
    }

    cookieStore.set(parsed.name, parsed.value, parsed.options);
  }
}
