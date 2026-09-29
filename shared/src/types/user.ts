import type { Role, UserStatus } from "./roles.js";

/**
 * API-facing shape of a user profile. Mirrors `users` in
 * DATABASE_DESIGN.md §1, but never includes authentication credentials —
 * those are never stored in the application database at all (ARCHITECTURE.md
 * §5), let alone exposed over the API.
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

/**
 * The authenticated session as the backend describes it to a client after
 * a successful login (ARCHITECTURE_DIAGRAM.md §2). The actual session
 * credential (cookie/token) is transport-level, not part of this payload.
 */
export interface SessionUser {
  user: UserProfile;
}
