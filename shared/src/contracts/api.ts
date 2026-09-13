/**
 * Generic API response envelope shared by every endpoint, so both clients
 * (web today, Flutter/iOS/Android later, per ARCHITECTURE.md §12) parse
 * responses and errors identically.
 *
 * Per SECURITY_ARCHITECTURE.md §13, error responses never leak internal
 * details (stack traces, database errors) — only a stable `code` and a
 * safe, human-readable `message`.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/** Standard success envelope. Kept intentionally thin — most endpoints
 * return the resource directly; this wrapper is reserved for endpoints
 * that need to attach metadata alongside the payload. */
export interface ApiResult<T> {
  data: T;
}
