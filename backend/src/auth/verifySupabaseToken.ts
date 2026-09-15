import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";
import { HttpError } from "../lib/httpError.js";

/**
 * The claims this backend actually relies on from a Supabase-issued access
 * token. Deliberately narrow — everything else in the token (arbitrary
 * custom claims, `app_metadata`, etc.) is never trusted for authorization
 * decisions (PHASE 06 instructions §3: "never trust ... arbitrary JWT
 * claims supplied by the client"). Role is never read from the token at
 * all — it is looked up from `public.users` after identity is verified
 * (see `src/users/provisioning.ts`).
 */
export interface SupabaseTokenClaims {
  /** Supabase's own user id (`auth.users.id`) — the external identity's
   * stable subject, stored in `user_identities.provider_subject`, never
   * used directly as our application `users.id`. */
  sub: string;
  email: string;
  /** Which Supabase Auth provider authenticated this session (e.g.
   * "google"). Read from standard Supabase claim shape; defaults to
   * "unknown" if absent so provisioning still has a deterministic value
   * rather than silently trusting an absent field as "google". */
  provider: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export class InvalidSessionError extends HttpError {
  constructor(reason: string) {
    super(401, "invalid_session", `Session is invalid or expired: ${reason}`);
  }
}

export class AuthNotConfiguredError extends HttpError {
  constructor() {
    super(
      500,
      "auth_not_configured",
      "Authentication is not configured on this server. See GOOGLE_OAUTH_SETUP.md.",
    );
  }
}

/**
 * Verifies a Supabase-issued access token's signature and expiry using the
 * project's JWT secret (`SUPABASE_JWT_SECRET` — see ENVIRONMENT.md), and
 * extracts only the narrow claim set this backend trusts.
 *
 * This performs real cryptographic verification (HS256, Supabase's default
 * signing algorithm for the shared-secret JWT scheme) — it is not a stub.
 * What is NOT implemented here: Supabase's newer asymmetric (ES256/JWKS)
 * signing-key option. If a live project uses that instead, this function
 * would need to fetch and verify against the project's JWKS endpoint
 * instead of a shared secret — documented as a known limitation in
 * AUTHENTICATION.md since it could not be exercised against a real
 * project in this environment (DATABASE_IMPLEMENTATION_REPORT.md:
 * "Supabase status: Not connected").
 */
export function verifySupabaseToken(token: string): SupabaseTokenClaims {
  const env = getEnv();
  if (!env.SUPABASE_JWT_SECRET) {
    throw new AuthNotConfiguredError();
  }

  let decoded: jwt.JwtPayload;
  try {
    const result = jwt.verify(token, env.SUPABASE_JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof result === "string") {
      throw new InvalidSessionError("unexpected token payload shape");
    }
    decoded = result;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new InvalidSessionError("expired");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new InvalidSessionError("malformed or invalid signature");
    }
    throw err;
  }

  if (typeof decoded.sub !== "string" || !decoded.sub) {
    throw new InvalidSessionError("missing subject claim");
  }
  if (typeof decoded.email !== "string" || !decoded.email) {
    throw new InvalidSessionError("missing email claim");
  }

  const appMetadata = (decoded as { app_metadata?: { provider?: unknown } }).app_metadata;
  const userMetadata = (decoded as {
    user_metadata?: { full_name?: unknown; name?: unknown; avatar_url?: unknown };
  }).user_metadata;

  return {
    sub: decoded.sub,
    email: decoded.email,
    provider: typeof appMetadata?.provider === "string" ? appMetadata.provider : "unknown",
    displayName:
      (typeof userMetadata?.full_name === "string" && userMetadata.full_name) ||
      (typeof userMetadata?.name === "string" && userMetadata.name) ||
      null,
    avatarUrl: typeof userMetadata?.avatar_url === "string" ? userMetadata.avatar_url : null,
  };
}
