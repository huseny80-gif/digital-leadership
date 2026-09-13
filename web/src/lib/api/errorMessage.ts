import { ApiError } from "./client";

/**
 * Maps a caught error to a safe, user-facing message — never the raw
 * backend `error.message` verbatim for unexpected failures, and never a
 * stack trace or technical detail (WEB_APPLICATION_ARCHITECTURE.md "Error
 * Handling"). The backend's own message is already safe by construction
 * (SECURITY_ARCHITECTURE.md §13), but this gives each page control over
 * wording appropriate to what the user was trying to do, and a single
 * place to keep that wording consistent.
 */
export function toSafeErrorMessage(err: unknown, context: string): { status: number | null; message: string } {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return { status: 401, message: "Your session has expired. Please sign in again." };
      case 403:
        return { status: 403, message: "You do not have permission to view this." };
      case 404:
        return { status: 404, message: `${context} not found.` };
      case 400:
        return { status: 400, message: "That request could not be understood." };
      default:
        return { status: err.status, message: `Unable to load ${context.toLowerCase()}. Please try again.` };
    }
  }
  return { status: null, message: `Unable to load ${context.toLowerCase()}. Please try again.` };
}
