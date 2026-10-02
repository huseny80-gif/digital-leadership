import { cookies } from "next/headers";

export const GUEST_SESSION_COOKIE = "training_guest_session";

/**
 * Reads the raw `training_guest_session` cookie value for the current
 * request, or `null` if absent. Never throws: `next/headers`'s `cookies()`
 * requires an active request scope, which a unit test invoking a Route
 * Handler/Server Component function directly (rather than through Next's
 * own request machinery) does not provide — that is "no request," not an
 * error, so it is treated identically to "no cookie" here rather than
 * propagating `next/headers`'s own exception.
 */
export async function readGuestSessionCookieValue(): Promise<string | null> {
  try {
    return (await cookies()).get(GUEST_SESSION_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}
