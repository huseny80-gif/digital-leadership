import type { ApiErrorBody, ApiResult } from "@shared/index";
import { getApiBaseUrl } from "@/config/env";
import { getCurrentAccessToken } from "@/lib/auth/session";

/**
 * Typed API client (server-side use — Server Components/Route Handlers).
 * Full request/response handling for the content/assessment API remains
 * Phase 7 work; what this phase adds is the actual auth wiring: every
 * call attaches the current Supabase access token as a bearer credential,
 * which the backend independently verifies (backend/src/middleware/auth.ts)
 * — this client never asserts identity or role itself, it only forwards
 * the token the backend will check on its own.
 */
export class ApiError extends Error {
  constructor(public readonly body: ApiErrorBody, public readonly status: number) {
    super(body.error.message);
  }
}

async function request<T>(method: "GET" | "POST", path: string): Promise<ApiResult<T>> {
  const token = await getCurrentAccessToken();
  const headers: HeadersInit = token ? { authorization: `Bearer ${token}` } : {};

  const res = await fetch(`${getApiBaseUrl()}${path}`, { method, headers, cache: "no-store" });
  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(body as ApiErrorBody, res.status);
  }
  return body as ApiResult<T>;
}

export function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string): Promise<ApiResult<T>> {
  return request<T>("POST", path);
}
