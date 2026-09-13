import type { SessionUser } from "@shared/index";

/**
 * Placeholder for the web client's session-reading interface.
 *
 * Per ARCHITECTURE.md §2.1 and §5, the web client never talks to the
 * identity provider's ongoing session directly — it holds only the
 * backend-issued session credential (a secure, HttpOnly cookie) and asks
 * the backend "who am I" to get the current user. No real implementation
 * exists yet; Phase 6 replaces this with an actual fetch to the backend's
 * session endpoint and real redirect behavior for unauthenticated callers.
 */
export async function getCurrentSession(): Promise<SessionUser | null> {
  throw new Error("Not implemented: session reading is added in Phase 6 (Authentication & Authorization).");
}
