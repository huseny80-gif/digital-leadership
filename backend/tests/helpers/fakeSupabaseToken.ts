import jwt from "jsonwebtoken";

/**
 * Builds a token shaped exactly like a real Supabase access token and
 * signs it with the test-only secret configured in vitest.config.ts. This
 * exercises our own verification code for real (signature check, expiry,
 * claim extraction) — it does NOT prove Supabase actually issues tokens
 * shaped this way for a live project, which is exactly the boundary
 * AUTHENTICATION_TEST_PLAN.md documents as "requires a real Supabase
 * project" vs. "fully automatable locally".
 */
export function signFakeSupabaseToken(claims: {
  sub: string;
  email: string;
  provider?: string;
  fullName?: string;
  avatarUrl?: string;
  expiresInSeconds?: number;
  secret?: string;
}): string {
  const secret = claims.secret ?? process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("SUPABASE_JWT_SECRET must be set for tests that sign a fake token.");
  }
  return jwt.sign(
    {
      sub: claims.sub,
      email: claims.email,
      app_metadata: { provider: claims.provider ?? "google" },
      user_metadata: {
        full_name: claims.fullName ?? "Test User",
        avatar_url: claims.avatarUrl ?? null,
      },
    },
    secret,
    { algorithm: "HS256", expiresIn: claims.expiresInSeconds ?? 3600 },
  );
}
