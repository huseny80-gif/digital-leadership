import type { Role } from "@shared/index";

/**
 * The single centralized authorization module referenced throughout
 * ARCHITECTURE.md §6 and SECURITY_ARCHITECTURE.md §2-3. Every protected
 * operation must call `can()` here rather than implementing its own
 * per-route permission check — this is what makes adding a future role
 * (e.g. "instructor", DECISIONS.md D17) a data change instead of a
 * code change scattered across every route.
 *
 * The actual permission data (roles/permissions/role_permissions, per
 * DATABASE_DESIGN.md §1) is loaded from the database starting in Phase 5;
 * until then this module holds the shape of the check, not a real grant
 * table.
 */
export type PermissionKey =
  | "content.manage"
  | "content.view"
  | "user.manage"
  | "quiz.attempt"
  | "quiz.manage"
  | "file.upload";

/** Placeholder permission map, mirroring the MVP roles in
 * DATABASE_MIGRATION_PLAN.md §4. Replaced by a real database-backed lookup
 * in Phase 5/6 — kept here only so the shape of `can()` is fixed now. */
const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  admin: ["content.manage", "content.view", "user.manage", "quiz.attempt", "quiz.manage", "file.upload"],
  user: ["content.view", "quiz.attempt"],
};

export function can(role: Role, permission: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
