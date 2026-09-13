/**
 * A safe, client-facing error. Per SECURITY_ARCHITECTURE.md §13, only
 * `code`/`message`/`status` ever reach the client — internal details
 * (stack traces, underlying causes) are logged server-side only, via the
 * central error-handling middleware, never serialized to the response.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notImplemented(feature: string): HttpError {
  return new HttpError(
    501,
    "not_implemented",
    `${feature} is not implemented in this phase — see IMPLEMENTATION_ROADMAP.md for when it lands.`,
  );
}

export function unauthenticated(): HttpError {
  return new HttpError(401, "unauthenticated", "Authentication is required.");
}

export function forbidden(): HttpError {
  return new HttpError(403, "forbidden", "You do not have permission to perform this action.");
}
