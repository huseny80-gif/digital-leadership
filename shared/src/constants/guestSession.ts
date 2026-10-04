/** Browsers cap persistent cookies at about 400 days. Renewing this browser
 * storage on activity does not impose an expiry on the permanent link or the
 * server session; the link can always be used again if browser data is lost. */
export const GUEST_SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
