import type { UserProfile } from "@shared/index";
import type { SupabaseTokenClaims } from "../auth/verifySupabaseToken.js";
import type { UsersRepository } from "./usersRepository.js";

/**
 * Safe first-login provisioning (PHASE 06 §7).
 *
 * 1. The caller has already verified the Supabase token (see
 *    `middleware/auth.ts`) — this function only ever receives claims that
 *    passed real signature/expiry verification, never client-asserted data.
 * 2. Looks up an existing application user linked to this external
 *    identity; if found, that row (including its current role, resolved
 *    from the database — never from the token) is returned as-is.
 * 3. If none exists, creates one with the approved default role ("user")
 *    and links the identity — the client never chooses its own role, and
 *    there is no code path here that can produce role = "admin".
 *
 * This is the ONLY place a `users` row is created as a result of
 * authentication. There is no separate/competing account-creation path.
 */
export async function resolveOrProvisionUser(
  repository: UsersRepository,
  claims: SupabaseTokenClaims,
): Promise<UserProfile> {
  const existing = await repository.findByIdentity(claims.provider, claims.sub);
  if (existing) {
    return existing;
  }

  return repository.createFromIdentity({
    email: claims.email,
    displayName: claims.displayName ?? claims.email,
    avatarUrl: claims.avatarUrl,
    provider: claims.provider,
    providerSubject: claims.sub,
  });
}
