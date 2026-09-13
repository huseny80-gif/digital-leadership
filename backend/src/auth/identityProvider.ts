/**
 * The pluggable identity-provider abstraction required by
 * ARCHITECTURE.md §5 and DECISIONS.md D4/D13: authentication methods are
 * added by implementing this interface, never by hardcoding provider
 * specifics into business logic or session issuance.
 */
export interface ExternalIdentity {
  provider: string;
  providerSubject: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface IdentityProvider {
  readonly name: string;
  /** Verifies a provider-issued credential server-side and returns the
   * resulting external identity. Must never trust a client-asserted
   * identity without this verification step. */
  verify(credential: string): Promise<ExternalIdentity>;
}
