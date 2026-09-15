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

/** Used for both "row doesn't exist" and "row exists but you're not
 * authorized to see it" — deliberately the same response in both cases
 * (SECURITY_ARCHITECTURE.md §13: "does not distinguish 'resource doesn't
 * exist' vs 'you don't have access' ... to avoid leaking information
 * about resource existence"), e.g. an unpublished subject a non-admin
 * requests by ID. */
export function notFound(resource: string): HttpError {
  return new HttpError(404, "not_found", `${resource} not found.`);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, "conflict", message);
}
