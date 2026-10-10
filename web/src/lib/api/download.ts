import { getApiBaseUrl } from "@/config/env";
import { getCurrentAccessToken } from "@/lib/auth/session";
import { readGuestSessionCookieValue, GUEST_SESSION_COOKIE } from "./guestCookie";
import { ApiError } from "./client";

/** Binary companion to apiPost: forwards only the verified session credential.
 * Files are streamed to the requesting learner and never stored in shared caches. */
export async function apiPostDownload(path: string, body: unknown): Promise<Response> {
  return requestDownload(path, "POST", body);
}

export async function apiGetDownload(path: string, options?: { range?: string }): Promise<Response> {
  return requestDownload(path, "GET", undefined, options?.range);
}

async function requestDownload(path: string, method: "GET" | "POST", body?: unknown, range?: string): Promise<Response> {
  const token = await getCurrentAccessToken();
  const headers: Record<string, string> = method === "POST" ? { "content-type": "application/json" } : {};
  if (range) headers.range = range;
  if (token) headers.authorization = `Bearer ${token}`;
  else {
    const cookie = await readGuestSessionCookieValue();
    if (cookie) headers.cookie = `${GUEST_SESSION_COOKIE}=${cookie}`;
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, { method, headers, ...(method === "POST" ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    let error;
    try { error = await response.json(); } catch { error = { error: { code: "export_failed", message: "تعذر تصدير التقرير. حاول مرة أخرى." } }; }
    throw new ApiError(error, response.status);
  }
  return response;
}
