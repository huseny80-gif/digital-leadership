import type { ApiErrorBody, ApiResult, PaginatedResult } from "@shared/index";
import { getApiBaseUrl } from "@/config/env";
import { getCurrentAccessToken } from "@/lib/auth/session";

/**
 * Typed API client (server-side use — Server Components/Route Handlers).
 * Centralizes the API base URL, request handling, and session-token
 * attachment (WEB_APPLICATION_ARCHITECTURE.md "Data Fetching") so no
 * component calls `fetch` directly — every call attaches the current
 * Supabase access token as a bearer credential, which the backend
 * independently verifies (backend/src/middleware/auth.ts) — this client
 * never asserts identity or role itself, it only forwards the token the
 * backend will check on its own.
 */
export class ApiError extends Error {
  constructor(public readonly body: ApiErrorBody, public readonly status: number) {
    super(body.error.message);
  }
}

async function requestJson(method: "GET" | "POST", path: string, jsonBody?: unknown): Promise<unknown> {
  const token = await getCurrentAccessToken();
  const headers: HeadersInit = token ? { authorization: `Bearer ${token}` } : {};
  if (jsonBody !== undefined) {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    cache: "no-store",
    ...(jsonBody !== undefined ? { body: JSON.stringify(jsonBody) } : {}),
  });
  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(body as ApiErrorBody, res.status);
  }
  return body;
}

/** For single-resource endpoints, whose body is `{ data: T }`
 * (API_V1.md) — e.g. `GET /me`, `GET /subjects/:id`, `GET /lectures/:id`. */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return (await requestJson("GET", path)) as ApiResult<T>;
}

export async function apiPost<T>(path: string, jsonBody?: unknown): Promise<ApiResult<T>> {
  return (await requestJson("POST", path, jsonBody ?? {})) as ApiResult<T>;
}

/** For collection endpoints, whose body IS the `PaginatedResult<T>`
 * envelope itself — `{ data: T[], page, limit, total }` (API_V1.md
 * "Pagination Contract") — not nested inside a second `data` wrapper. */
export async function apiGetPaginated<T>(path: string): Promise<PaginatedResult<T>> {
  return (await requestJson("GET", path)) as PaginatedResult<T>;
}
