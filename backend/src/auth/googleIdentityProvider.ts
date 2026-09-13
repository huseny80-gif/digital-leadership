import type { ExternalIdentity, IdentityProvider } from "./identityProvider.js";

/**
 * Placeholder Google OAuth implementation of `IdentityProvider`.
 *
 * Real token verification (audience/issuer/signature/expiry checks against
 * Google's public keys, per SECURITY_ARCHITECTURE.md §1) is implemented in
 * Phase 6. This class exists now only to prove the interface boundary
 * compiles and to be the concrete place Phase 6 fills in — no network call
 * or credential handling happens here yet.
 */
export class GoogleIdentityProvider implements IdentityProvider {
  readonly name = "google";

  async verify(_credential: string): Promise<ExternalIdentity> {
    throw new Error(
      "Not implemented: Google OAuth verification is added in Phase 6 (Authentication & Authorization).",
    );
  }
}
