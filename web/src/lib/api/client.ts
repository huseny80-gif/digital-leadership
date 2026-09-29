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

/** Server-console-only diagnostics for this module's two failure points
 * that would otherwise surface only as the generic "Unable to load..."
 * message a caller shows the user (`lib/api/errorMessage.ts`) — with no
 * server-side trace of which of the two actually failed or why. Never
 * logs the access token, cookies, or the request/response body — only
 * the resolved API host, a `hasToken` boolean, the path, and the
 * failing error's name/message (never its stack, which could otherwise
 * echo request internals into logs). */
function logRequestFailure(
  stage: "resolve_config" | "get_access_token" | "fetch",
  method: string,
  path: string,
  hasToken: boolean | "unknown",
  err: unknown,
): void {
  let apiHost = "unresolved";
  try {
    apiHost = new URL(getApiBaseUrl()).host;
  } catch {
    apiHost = "invalid_or_unset";
  }
  const error = err instanceof Error ? { name: err.name, message: err.message } : { name: "unknown", message: String(err) };
  console.error("api_client_request_failed", { stage, method, path, apiHost, hasToken, error });
}

async function requestJson(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, jsonBody?: unknown): Promise<unknown> {
  let token: string | null;
  try {
    token = await getCurrentAccessToken();
  } catch (err) {
    logRequestFailure("get_access_token", method, path, "unknown", err);
    throw err;
  }

  const headers: HeadersInit = token ? { authorization: `Bearer ${token}` } : {};
  if (jsonBody !== undefined) {
    headers["content-type"] = "application/json";
  }

  let apiBaseUrl: string;
  try {
    apiBaseUrl = getApiBaseUrl();
  } catch (err) {
    logRequestFailure("resolve_config", method, path, Boolean(token), err);
    throw err;
  }

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      cache: "no-store",
      ...(jsonBody !== undefined ? { body: JSON.stringify(jsonBody) } : {}),
    });
  } catch (err) {
    logRequestFailure("fetch", method, path, Boolean(token), err);
    throw err;
  }

  if (res.status === 204) {
    if (!res.ok) throw new ApiError({ error: { code: "error", message: "Request failed." } }, res.status);
    return { data: null };
  }

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

export async function apiPatch<T>(path: string, jsonBody: unknown): Promise<ApiResult<T>> {
  return (await requestJson("PATCH", path, jsonBody)) as ApiResult<T>;
}

export async function apiDelete(path: string): Promise<void> {
  await requestJson("DELETE", path);
}

/** For collection endpoints, whose body IS the `PaginatedResult<T>`
 * envelope itself — `{ data: T[], page, limit, total }` (API_V1.md
 * "Pagination Contract") — not nested inside a second `data` wrapper. */
export async function apiGetPaginated<T>(path: string): Promise<PaginatedResult<T>> {
  return (await requestJson("GET", path)) as PaginatedResult<T>;
}
