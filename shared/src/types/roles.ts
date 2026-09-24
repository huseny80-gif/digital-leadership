/**
 * Mirrors the `roles`/`permissions` model in DATABASE_DESIGN.md §1.
 * Roles are data-driven; `Role` is intentionally a string, not a fixed
 * union of exactly "admin" | "user", so a future role (e.g. "instructor",
 * DECISIONS.md D17) does not require a type change here — callers that
 * need exhaustiveness for the two known MVP roles should narrow via the
 * `KNOWN_ROLES` list rather than assuming this type is closed.
 */
export type Role = string;

export const KNOWN_ROLES = {
  ADMIN: "admin",
  USER: "user",
} as const;

export type UserStatus = "active" | "suspended";
