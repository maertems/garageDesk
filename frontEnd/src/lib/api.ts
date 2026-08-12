/**
 * Server-side API client: calls backend from Next server (not from browser).
 * Session is read from cookie and sent as X-Session-Id header.
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:80";

function getSessionFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/sessionId=([^;]+)/);
  return match ? match[1].trim() : null;
}

export async function apiFetch(
  path: string,
  options: RequestInit & { cookie?: string | null } = {}
): Promise<Response> {
  const { cookie, ...rest } = options;
  const sessionId = getSessionFromCookie(cookie ?? null);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((rest.headers as Record<string, string>) || {}),
  };
  if (sessionId) headers["X-Session-Id"] = sessionId;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...rest,
    headers: { ...headers, ...rest.headers },
  });
  return res;
}

export async function apiJson<T>(path: string, cookie?: string | null): Promise<T> {
  const res = await apiFetch(path, { cookie });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function apiPost(
  path: string,
  body: unknown,
  cookie?: string | null
): Promise<Response> {
  return apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
    cookie,
  });
}

export async function apiPatch(
  path: string,
  body: unknown,
  cookie?: string | null
): Promise<Response> {
  return apiFetch(path, {
    method: "PATCH",
    body: JSON.stringify(body),
    cookie,
  });
}

export async function apiDelete(path: string, cookie?: string | null): Promise<Response> {
  return apiFetch(path, { method: "DELETE", cookie });
}

export { BACKEND_URL };
