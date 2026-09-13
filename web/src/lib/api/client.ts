import type { ApiErrorBody, ApiResult } from "@shared/index";
import { getApiBaseUrl } from "@/config/env";

/**
 * Placeholder typed API client.
 *
 * Real request logic (credentials handling, error normalization per
 * SECURITY_ARCHITECTURE.md §13, retry/timeout policy) is implemented in
 * Phase 7 once the backend endpoints described in API_ARCHITECTURE.md
 * actually exist. This stub exists only to establish the module boundary
 * and prove the shared-contract wiring compiles end-to-end.
 */
export class ApiError extends Error {
  constructor(public readonly body: ApiErrorBody) {
    super(body.error.message);
  }
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  void getApiBaseUrl();
  void path;
  throw new Error("Not implemented: API client is implemented in Phase 7 (Core Backend & Educational Content APIs).");
}
