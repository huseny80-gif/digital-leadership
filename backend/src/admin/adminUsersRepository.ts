import type { Pool } from "pg";
import type { AdminUser } from "@shared/index";

interface AdminUserRow {
  id: string;
  email: string;
  display_name: string;
  role_name: string;
  status: "active" | "suspended";
  created_at: Date;
}

function toAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Admin read/write access to `users`/`roles` (PHASE 09C "User
 * Management"). Deliberately does NOT touch `user_identities` or
 * anything authentication-related — role and status are the only
 * admin-mutable fields on a user, matching the explicit "no password
 * management, no local login" restriction.
 */
export class AdminUsersRepository {
  constructor(private readonly pool: Pool) {}

  async listUsers(): Promise<AdminUser[]> {
    const result = await this.pool.query<AdminUserRow>(
      `select u.id, u.email, u.display_name, r.name as role_name, u.status, u.created_at
       from users u join roles r on r.id = u.role_id
       where u.deleted_at is null
       order by u.created_at desc`,
    );
    return result.rows.map(toAdminUser);
  }

  async getUser(id: string): Promise<AdminUser | null> {
    const result = await this.pool.query<AdminUserRow>(
      `select u.id, u.email, u.display_name, r.name as role_name, u.status, u.created_at
       from users u join roles r on r.id = u.role_id
       where u.id = $1 and u.deleted_at is null`,
      [id],
    );
    return result.rows[0] ? toAdminUser(result.rows[0]) : null;
  }

  /** Count of users currently holding the `admin` role (status
   * irrelevant to this count — a suspended admin still "holds" the role
   * for the purpose of the final-admin protection; see
   * `AdminUsersService.assignRole`). */
  async countAdmins(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*) from users u join roles r on r.id = u.role_id where r.name = 'admin' and u.deleted_at is null`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async countActiveAdmins(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*) from users u join roles r on r.id = u.role_id
       where r.name = 'admin' and u.status = 'active' and u.deleted_at is null`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getRoleIdByName(name: "admin" | "user"): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>("select id from roles where name = $1", [name]);
    return result.rows[0]?.id ?? null;
  }

  async setUserRole(id: string, roleId: string): Promise<boolean> {
    const result = await this.pool.query("update users set role_id = $1 where id = $2 and deleted_at is null", [roleId, id]);
    return result.rowCount! > 0;
  }

  async setUserStatus(id: string, status: "active" | "suspended"): Promise<boolean> {
    const result = await this.pool.query("update users set status = $1 where id = $2 and deleted_at is null", [status, id]);
    return result.rowCount! > 0;
  }
}
