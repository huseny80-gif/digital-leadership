import type { Pool } from "pg";

export interface GrantRow {
  id: string;
  label: string | null;
  description: string | null;
  max_sessions: number | null;
  session_count: string;
  revoked: boolean;
  revoked_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GuestSessionRow {
  id: string;
  grant_id: string;
  display_name: string;
  status: "active" | "expired" | "revoked";
  created_at: string;
  last_seen_at: string;
  expires_at: string | null;
}

/**
 * Data-access boundary for Phase 6 open training access
 * (`training_access_grants` / `guest_training_sessions`). Follows the
 * repository-per-feature convention (e.g. `content/contentRepository.ts`,
 * `admin/adminOverviewRepository.ts`) — every query here is parameterized,
 * and nothing here decides authorization; callers (service layer) do.
 */
export class TrainingAccessRepository {
  constructor(private readonly pool: Pool) {}

  async createGrant(params: {
    id?: string;
    tokenHash: string;
    shareTokenCiphertext?: string;
    label: string | null;
    description: string | null;
    maxSessions: number | null;
    expiresAt: Date | null;
    createdBy: string;
  }): Promise<GrantRow> {
    const result = await this.pool.query<{ id: string }>(
      `insert into training_access_grants
         (id, token_hash, label, description, max_sessions, expires_at, created_by, share_token_hash, share_token_ciphertext)
       values (coalesce($7::uuid,gen_random_uuid()), $1, $2, $3, $4, $5, $6, case when $8::text is null then null else $1 end, $8)
       returning id`,
      [params.tokenHash, params.label, params.description, params.maxSessions, params.expiresAt, params.createdBy, params.id ?? null, params.shareTokenCiphertext ?? null],
    );
    return (await this.getGrantById(result.rows[0]!.id))!;
  }

  async getGrantById(id: string): Promise<GrantRow | null> {
    const result = await this.pool.query<GrantRow>(
      `select g.id, g.label, g.description,
              g.max_sessions,
              (select count(*)::text from guest_training_sessions gs where gs.grant_id = g.id) as session_count,
              g.revoked, g.revoked_at, g.expires_at, g.created_by, g.created_at, g.updated_at
       from training_access_grants g
       where g.id = $1 and g.archived_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async getGrantByTokenHash(tokenHash: string): Promise<GrantRow | null> {
    const result = await this.pool.query<GrantRow>(
      `select g.id, g.label, g.description,
              g.max_sessions,
              (select count(*)::text from guest_training_sessions gs where gs.grant_id = g.id) as session_count,
              g.revoked, g.revoked_at, g.expires_at, g.created_by, g.created_at, g.updated_at
       from training_access_grants g
       where (g.token_hash = $1 or g.share_token_hash = $1) and g.archived_at is null`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  async listGrants(): Promise<GrantRow[]> {
    const result = await this.pool.query<GrantRow>(
      `select g.id, g.label, g.description,
              g.max_sessions,
              (select count(*)::text from guest_training_sessions gs where gs.grant_id = g.id) as session_count,
              g.revoked, g.revoked_at, g.expires_at, g.created_by, g.created_at, g.updated_at
       from training_access_grants g
       where g.archived_at is null
       order by g.created_at desc`,
    );
    return result.rows;
  }

  async revokeGrant(id: string): Promise<void> {
    await this.pool.query(`update training_access_grants set revoked = true, revoked_at = now(), archived_at = now() where id = $1`, [id]);
  }

  /** Serialize copies so legacy grants gain one persistent sharing link. */
  async getOrCreateShareToken(id: string, candidate: { hash: string; ciphertext: string }): Promise<{ hash: string; ciphertext: string } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{ share_token_hash: string | null; share_token_ciphertext: string | null }>(
        "select share_token_hash,share_token_ciphertext from training_access_grants where id=$1 and not revoked and archived_at is null and (expires_at is null or expires_at>now()) for update", [id],
      );
      const row = result.rows[0];
      if (!row) { await client.query("commit"); return null; }
      if (row.share_token_ciphertext === null) {
        await client.query("update training_access_grants set share_token_hash=$2,share_token_ciphertext=$3 where id=$1", [id,candidate.hash,candidate.ciphertext]);
      }
      await client.query("commit");
      return row.share_token_ciphertext !== null
        ? { hash: row.share_token_hash!, ciphertext: row.share_token_ciphertext }
        : candidate;
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }

  async cleanDisabledGrants(): Promise<number> {
    const result = await this.pool.query("update training_access_grants set archived_at=now() where revoked and archived_at is null returning id");
    return result.rowCount ?? 0;
  }

  async createGuestSession(params: {
    grantId: string;
    displayName: string;
    expiresAt: Date | null;
  }): Promise<GuestSessionRow> {
    const result = await this.pool.query<{ id: string }>(
      `insert into guest_training_sessions (grant_id, display_name, expires_at)
       values ($1, $2, $3)
       returning id`,
      [params.grantId, params.displayName, params.expiresAt],
    );
    return (await this.getGuestSessionById(result.rows[0]!.id))!;
  }

  async getGuestSessionById(id: string): Promise<GuestSessionRow | null> {
    const result = await this.pool.query<GuestSessionRow>(
      `select gs.id, gs.grant_id, gs.display_name,
              gs.status, gs.created_at, gs.last_seen_at, gs.expires_at
       from guest_training_sessions gs
       join training_access_grants g on g.id = gs.grant_id
       where gs.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async touchLastSeen(id: string): Promise<void> {
    await this.pool.query(`update guest_training_sessions set last_seen_at = now() where id = $1`, [id]);
  }

  async countActiveSessionsForGrant(grantId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*)::text as count from guest_training_sessions where grant_id = $1 and status = 'active'`,
      [grantId],
    );
    return Number(result.rows[0]!.count);
  }

  /**
   * Admin-only guest trainee analytics (a NEW read path — see
   * `shared/src/types/trainingAccess.ts`'s `GuestTraineeAnalyticsRow`
   * comment for why this is not merged into the existing
   * `AdminAnalyticsRepository`'s registered-student queries). Every join
   * here is keyed off `guest_training_sessions.id`
   * (`lecture_progress.guest_session_id` / `quiz_attempts.guest_session_id`
   * — the same nullable-FK-with-XOR-constraint columns migration 16
   * added), never `user_id`, so this can never pull in a registered
   * learner's data. Progress and total lectures both count the same
   * published, non-deleted lectures and parent subjects across the
   * platform, matching the guest's platform-wide access.
   */
  async listGuestAnalytics(): Promise<GuestAnalyticsRow[]> {
    const result = await this.pool.query<GuestAnalyticsRow>(
      `select
         gs.id as guest_session_id,
         gs.display_name,
         g.id as grant_id,
         case when gs.status='active' and gs.expires_at is not null and gs.expires_at<=now() then 'expired' else gs.status::text end as status,
         gs.created_at as joined_at,
         gs.last_seen_at,
         (select count(*) from lecture_progress lp join lectures l on l.id=lp.lecture_id join subjects s on s.id=l.subject_id where lp.guest_session_id = gs.id and lp.completed and l.status='published' and l.deleted_at is null and s.status='published' and s.deleted_at is null) as lectures_completed,
         (select count(*) from lectures l join subjects s on s.id=l.subject_id where l.status = 'published' and l.deleted_at is null and s.status='published' and s.deleted_at is null) as total_lectures,
         (select count(*) from quiz_attempts qa where qa.guest_session_id = gs.id) as quizzes_started,
         (select count(*) from quiz_attempts qa where qa.guest_session_id = gs.id and qa.status = 'graded') as quizzes_completed,
         (select avg(qa.score) from quiz_attempts qa where qa.guest_session_id = gs.id and qa.status = 'graded' and qa.score is not null) as average_score
       from guest_training_sessions gs
       join training_access_grants g on g.id = gs.grant_id
       order by gs.created_at desc`,
    );
    return result.rows;
  }
}

export interface GuestAnalyticsRow {
  guest_session_id: string;
  display_name: string;
  grant_id: string;
  status: "active" | "expired" | "revoked";
  joined_at: string;
  last_seen_at: string;
  lectures_completed: string;
  total_lectures: string;
  quizzes_started: string;
  quizzes_completed: string;
  average_score: string | null;
}
