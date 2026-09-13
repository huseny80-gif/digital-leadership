"use client";

import type { ApiErrorBody } from "@shared/index";

/**
 * Browser-side helper for calling the admin BFF proxy
 * (`/api/admin/[...path]`) from client components (PHASE 09C). Every
 * admin form/action in this app goes through this — never a raw `fetch`
 * to the backend, and never a direct database/storage call.
 */
export class AdminApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const json = await res.json();
  if (!res.ok) {
    const errBody = json as ApiErrorBody;
    throw new AdminApiError(res.status, errBody.error?.code ?? "error", errBody.error?.message ?? "Request failed.");
  }
  return json.data as T;
}

export const adminGet = <T>(path: string) => request<T>("GET", path);
export const adminPost = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});
export const adminPatch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
export const adminDelete = (path: string) => request<void>("DELETE", path);
