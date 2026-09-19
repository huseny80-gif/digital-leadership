import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";
import type { JWTVerifyGetKey } from "jose";
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

let cachedRemoteJwks: { url: string; jwks: JWTVerifyGetKey } | null = null;

function getProductionJwks(supabaseUrl: string): JWTVerifyGetKey {
  if (cachedRemoteJwks && cachedRemoteJwks.url === supabaseUrl) {
    return cachedRemoteJwks.jwks;
  }
  const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  cachedRemoteJwks = { url: supabaseUrl, jwks };
  return jwks;
}

/**
 * Test-only dependency injection point. When set, `verifySupabaseToken`
 * verifies against this JWKS instead of fetching Supabase's real one over
 * the network. Production code (this file, `middleware/auth.ts`, and
 * every route) never calls this — it stays `null` for the entire
 * lifetime of a real server process, so production behavior is
 * completely unaffected by this existing. The only caller is
 * `tests/helpers/testJwt.ts`.
 */
let testJwksOverride: JWTVerifyGetKey | null = null;

export function __setJwksForTesting(jwks: JWTVerifyGetKey | null): void {
  testJwksOverride = jwks;
}

/**
 * Verifies a Supabase-issued access token's signature and expiry against
 * Supabase's own published signing keys (ES256, fetched from
 * `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` — Supabase's current
 * asymmetric signing-key scheme), and extracts only the narrow claim set
 * this backend trusts.
 *
 * `SUPABASE_URL` is the only configuration this depends on now — the
 * legacy shared-secret (`SUPABASE_JWT_SECRET`, HS256) scheme is no longer
 * used to verify tokens.
 */
export async function verifySupabaseToken(token: string): Promise<SupabaseTokenClaims> {
  const env = getEnv();
  const jwks = testJwksOverride ?? (env.SUPABASE_URL ? getProductionJwks(env.SUPABASE_URL) : null);
  if (!jwks) {
    throw new AuthNotConfiguredError();
  }

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, jwks, { algorithms: ["ES256"] });
    payload = result.payload;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new InvalidSessionError("expired");
    }
    if (err instanceof joseErrors.JOSEError) {
      throw new InvalidSessionError("malformed or invalid signature");
    }
    throw err;
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new InvalidSessionError("missing subject claim");
  }
  if (typeof payload.email !== "string" || !payload.email) {
    throw new InvalidSessionError("missing email claim");
  }

  const appMetadata = (payload as { app_metadata?: { provider?: unknown } }).app_metadata;
  const userMetadata = (payload as {
    user_metadata?: { full_name?: unknown; name?: unknown; avatar_url?: unknown };
  }).user_metadata;

  return {
    sub: payload.sub,
    email: payload.email,
    provider: typeof appMetadata?.provider === "string" ? appMetadata.provider : "unknown",
    displayName:
      (typeof userMetadata?.full_name === "string" && userMetadata.full_name) ||
      (typeof userMetadata?.name === "string" && userMetadata.name) ||
      null,
    avatarUrl: typeof userMetadata?.avatar_url === "string" ? userMetadata.avatar_url : null,
  };
}
