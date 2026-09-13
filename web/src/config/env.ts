/**
 * Centralized, typed access to environment configuration. See
 * ENVIRONMENT.md and `.env.example` at the repository root for the full
 * variable list. No secret ever belongs in a `NEXT_PUBLIC_*` variable —
 * only non-sensitive, client-safe configuration (SECURITY_ARCHITECTURE.md
 * §10).
 */
export function getApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. Copy .env.example to .env.local and fill it in — see ENVIRONMENT.md.",
    );
  }
  return value;
}

export function getGoogleOAuthClientId(): string {
  const value = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is not set. Copy .env.example to .env.local and fill it in — see ENVIRONMENT.md.",
    );
  }
  return value;
}
