import type { Pool } from "pg";
import type { UserProfile } from "@shared/index";

/**
 * Data-access boundary for users/identities (DATABASE_DESIGN.md §1). The
 * interface exists so `provisioning.ts` and tests never depend on a
 * concrete database client directly (ARCHITECTURE.md §3) — `PgUsersRepository`
 * is the real implementation; tests use an in-memory fake (see
 * `backend/tests/unit/provisioning.test.ts`).
 */
export interface UsersRepository {
  findByIdentity(provider: string, providerSubject: string): Promise<UserProfile | null>;
  findById(id: string): Promise<UserProfile | null>;
  /** Creates a new user with the approved default role ("user" — never
   * "admin", per this phase's explicit requirement) and links the given
   * external identity to it, in one transaction. Also writes an audit log
   * entry (DATABASE_DESIGN.md §6). */
  createFromIdentity(input: {
    email: string;
    displayName: string;
    avatarUrl: string | null;
    provider: string;
    providerSubject: string;
  }): Promise<UserProfile>;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role_name: string;
  status: "active" | "suspended";
  created_at: Date;
}

function toProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

const SELECT_USER_WITH_ROLE = `
  select u.id, u.email, u.display_name, u.avatar_url, r.name as role_name, u.status, u.created_at
  from users u
  join roles r on r.id = u.role_id
  where u.deleted_at is null
`;

export class PgUsersRepository implements UsersRepository {
  constructor(private readonly pool: Pool) {}

  async findByIdentity(provider: string, providerSubject: string): Promise<UserProfile | null> {
    const result = await this.pool.query<UserRow>(
      `${SELECT_USER_WITH_ROLE}
         and u.id = (
           select ui.user_id from user_identities ui
           where ui.provider = $1 and ui.provider_subject = $2
         )`,
      [provider, providerSubject],
    );
    return result.rows[0] ? toProfile(result.rows[0]) : null;
  }

  async findById(id: string): Promise<UserProfile | null> {
    const result = await this.pool.query<UserRow>(`${SELECT_USER_WITH_ROLE} and u.id = $1`, [id]);
    return result.rows[0] ? toProfile(result.rows[0]) : null;
  }

  async createFromIdentity(input: {
    email: string;
    displayName: string;
    avatarUrl: string | null;
    provider: string;
    providerSubject: string;
  }): Promise<UserProfile> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      // Default role is always "user" — never client-chosen, never "admin"
      // (this phase's explicit requirement; see provisioning.ts and
      // AUTHORIZATION.md "User Provisioning").
      const roleResult = await client.query<{ id: string }>(
        `select id from roles where name = 'user'`,
      );
      const roleId = roleResult.rows[0]?.id;
      if (!roleId) {
        throw new Error(
          "The 'user' role is missing from the roles table — the RBAC seed migration " +
            "(supabase/migrations/00000000000002_rbac_foundation.sql) has not been applied.",
        );
      }

      const userResult = await client.query<UserRow>(
        `insert into users (email, display_name, avatar_url, role_id)
         values ($1, $2, $3, $4)
         returning id, email, display_name, avatar_url, status, created_at`,
        [input.email, input.displayName, input.avatarUrl, roleId],
      );
      const inserted = userResult.rows[0];
      if (!inserted) {
        throw new Error("User insert returned no row.");
      }

      await client.query(
        `insert into user_identities (user_id, provider, provider_subject) values ($1, $2, $3)`,
        [inserted.id, input.provider, input.providerSubject],
      );

      await client.query(
        `insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         values ($1, 'user.provisioned', 'user', $1, $2)`,
        [inserted.id, JSON.stringify({ provider: input.provider })],
      );

      await client.query("commit");

      return {
        id: inserted.id,
        email: inserted.email,
        displayName: inserted.display_name,
        avatarUrl: inserted.avatar_url,
        role: "user",
        status: inserted.status,
        createdAt: inserted.created_at.toISOString(),
      };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }
}
