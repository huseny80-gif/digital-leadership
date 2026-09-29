import type { Pool } from "pg";
import type { AdminUser } from "@shared/index";
import type { AdminUsersRepository } from "./adminUsersRepository.js";
import { conflict, notFound } from "../lib/httpError.js";
import { ValidationError } from "../lib/validation.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * Admin user/role management (PHASE 09C "User Management" /
 * "Role Management" / "Self-Lockout Protection"). Only two fields are
 * ever mutable here — `role` (admin/user, the two roles this schema
 * already defines — never a new one) and `status` (active/suspended,
 * the existing `user_status` enum) — matching the explicit restriction
 * against inventing password/login/new-provider functionality.
 */
export class AdminUsersService {
  constructor(private readonly pool: Pool, private readonly repository: AdminUsersRepository) {}

  listUsers(): Promise<AdminUser[]> {
    return this.repository.listUsers();
  }

  async getUserOrThrow(id: string): Promise<AdminUser> {
    const user = await this.repository.getUser(id);
    if (!user) throw notFound("User");
    return user;
  }

  /**
   * Assigns an existing role (never creates one). Refuses any change
   * that would remove the platform's last `admin` — whether that's the
   * caller demoting themselves as the sole admin, or demoting anyone
   * else when they are the sole admin (PHASE 09C "Self-Lockout
   * Protection": both the "own last access" case and the "final
   * remaining administrator" case are the same underlying rule here,
   * since this schema has no per-resource admin scoping — every admin
   * is a platform-wide admin, so "my last access" and "the last admin"
   * collapse to one check).
   */
  async assignRole(targetUserId: string, role: "admin" | "user", actorUserId: string): Promise<AdminUser> {
    const target = await this.getUserOrThrow(targetUserId);

    if (role === "user" && target.role === "admin") {
      const adminCount = await this.repository.countAdmins();
      if (adminCount <= 1) {
        throw conflict("Cannot remove the platform's last administrator. Promote another user to admin first.");
      }
    }

    const roleId = await this.repository.getRoleIdByName(role);
    if (!roleId) throw new ValidationError(`Role '${role}' does not exist.`);

    const updated = await this.repository.setUserRole(targetUserId, roleId);
    if (!updated) throw notFound("User");

    // Explicit audit trail for every role change, including who did it to
    // whom — role changes are exactly the class of action
    // DATABASE_SECURITY.md §8 calls out by name for logging.
    await writeAuditLog(this.pool, {
      actorUserId,
      action: "user.role_changed",
      entityType: "user",
      entityId: targetUserId,
      metadata: { fromRole: target.role, toRole: role, selfChange: actorUserId === targetUserId },
    });

    return this.getUserOrThrow(targetUserId);
  }

  /**
   * Suspends or reactivates a user. Refuses to suspend the platform's
   * last active admin — the same self-lockout principle as role
   * assignment, applied to status instead (an admin whose role is
   * intact but whose account is suspended is just as locked out in
   * practice).
   */
  async setStatus(targetUserId: string, status: "active" | "suspended", actorUserId: string): Promise<AdminUser> {
    const target = await this.getUserOrThrow(targetUserId);

    if (status === "suspended" && target.role === "admin" && target.status === "active") {
      const activeAdmins = await this.repository.countActiveAdmins();
      if (activeAdmins <= 1) {
        throw conflict("Cannot suspend the platform's last active administrator.");
      }
    }

    const updated = await this.repository.setUserStatus(targetUserId, status);
    if (!updated) throw notFound("User");

    await writeAuditLog(this.pool, {
      actorUserId,
      action: status === "suspended" ? "user.suspended" : "user.reactivated",
      entityType: "user",
      entityId: targetUserId,
      metadata: { selfChange: actorUserId === targetUserId },
    });

    return this.getUserOrThrow(targetUserId);
  }
}
