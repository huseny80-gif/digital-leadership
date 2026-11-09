import type { Pool } from "pg";
import type { LoginNotificationsFeed } from "@shared/index";
import { notFound } from "../lib/httpError.js";

export interface LearnerLoginEntry {
  kind: "trainee" | "visitor";
  principalId: string;
  fingerprint: string;
}

export interface LoginNotificationsStore {
  recordEntry(entry: LearnerLoginEntry): Promise<boolean>;
  feed(adminUserId: string): Promise<LoginNotificationsFeed>;
  acknowledge(adminUserId: string, throughId: string): Promise<void>;
}

interface FeedRow {
  items: Array<{ id: string; kind: "trainee" | "visitor"; display_name: string; entered_at: string; read: boolean }>;
  unread_count: string;
  latest_id: string | null;
}

// Guest cookie IDs are credentials. Audit entries contain only their hash;
// PostgreSQL's built-in SHA256 resolves the existing source row for its name.
const entriesCte = `entries as (
  select a.id, a.created_at,
         case when a.entity_type = 'user' then 'trainee' else 'visitor' end as kind,
         coalesce(u.display_name, gs.display_name) as display_name
  from audit_logs a
  left join users u on a.entity_type = 'user' and u.id = a.entity_id
  left join roles r on r.id = u.role_id
  left join guest_training_sessions gs
    on a.entity_type = 'guest_training_session'
   and encode(sha256(convert_to('guest:' || gs.id::text, 'UTF8')), 'hex') = a.metadata->>'sessionFingerprint'
  where a.action = 'learner.login'
    and ((a.entity_type = 'user' and r.name = 'user')
      or (a.entity_type = 'guest_training_session' and gs.id is not null))
)`;

/** Existing append-only audit_logs is the only persistence mechanism here.
 * Transaction-scoped locks serialize login appends and each admin's ACKs.
 * The lock query must remain separate from the INSERT so READ COMMITTED takes
 * a fresh snapshot after a concurrent request commits. */
export class LoginNotificationsRepository implements LoginNotificationsStore {
  constructor(private readonly pool: Pick<Pool, "query" | "connect">) {}

  async recordEntry(entry: LearnerLoginEntry): Promise<boolean> {
    const client = await this.pool.connect();
    const entityType = entry.kind === "trainee" ? "user" : "guest_training_session";
    try {
      await client.query("begin isolation level read committed");
      // A common append lock and strictly increasing server time preserve
      // commit order even during equal clock ticks or clock adjustments. An
      // entry invisible to an earlier feed can never fall below its ACK cursor.
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        "learner.login.append",
      ]);
      const result = await client.query<{ id: string }>(
        `insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
         select $1::uuid, 'learner.login', $2::text,
                case when $2::text = 'user' then $3::uuid else null end,
                jsonb_build_object('sessionFingerprint', $4::text),
                greatest(clock_timestamp(), coalesce(
                  (select max(created_at) + interval '1 microsecond' from audit_logs where action = 'learner.login'),
                  '-infinity'::timestamptz))
         from (
           select u.id from users u join roles r on r.id = u.role_id
           where $2::text = 'user' and u.id = $3::uuid and u.status = 'active' and r.name = 'user'
           union all
           select gs.id from guest_training_sessions gs
           where $2::text = 'guest_training_session' and gs.id = $3::uuid
             and gs.status = 'active' and (gs.expires_at is null or gs.expires_at > clock_timestamp())
             and encode(sha256(convert_to('guest:' || gs.id::text, 'UTF8')), 'hex') = $4::text
         ) usable_principal
         where not exists (
           select 1 from audit_logs existing
           where existing.action = 'learner.login' and existing.entity_type = $2::text
             and existing.entity_id is not distinct from (case when $2::text = 'user' then $3::uuid else null end)
             and existing.metadata->>'sessionFingerprint' = $4::text
         )
         returning id`,
        [entry.kind === "trainee" ? entry.principalId : null, entityType, entry.principalId, entry.fingerprint],
      );
      await client.query("commit");
      return result.rows.length > 0;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async feed(adminUserId: string): Promise<LoginNotificationsFeed> {
    // One statement gives the rows, total unread count and cursor one snapshot.
    const result = await this.pool.query<FeedRow>(
      `with ${entriesCte}, watermark as (
         select target.created_at, target.id
         from audit_logs ack join audit_logs target on target.id = ack.entity_id
         where ack.action = 'login_notifications.read' and ack.entity_type = 'login_notification'
           and ack.actor_user_id = $1::uuid and target.action = 'learner.login'
         order by target.created_at desc, target.id desc limit 1
       ), marked as (
         select e.*, coalesce((e.created_at, e.id) <= (select w.created_at, w.id from watermark w), false) as read
         from entries e
       )
       select coalesce((select jsonb_agg(to_jsonb(page) order by page.entered_at desc, page.id desc)
         from (select id, kind, display_name, created_at as entered_at, read from marked
               order by created_at desc, id desc limit 20) page), '[]'::jsonb) as items,
         (select count(*)::text from marked where not read) as unread_count,
         (select id from marked order by created_at desc, id desc limit 1) as latest_id`,
      [adminUserId],
    );
    const row = result.rows[0]!;
    return {
      items: row.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        // Existing provisioning may use email as display_name. Never reveal it
        // through this activity feed, including inside a longer display name.
        displayName: safeDisplayName(item.display_name, item.kind),
        enteredAt: new Date(item.entered_at).toISOString(),
        read: item.read,
      })),
      unreadCount: Number(row.unread_count),
      latestId: row.latest_id,
    };
  }

  async acknowledge(adminUserId: string, throughId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`login_notifications.read:${adminUserId}`]);
      // Resolve the cursor against real server entries, preserving Postgres
      // timestamp precision. A stale ACK can never move the watermark backward.
      const target = await client.query<{ id: string }>(
        `with ${entriesCte} select id from entries where id = $1::uuid`, [throughId],
      );
      if (!target.rows[0]) throw notFound("Login notification");
      await client.query(
        `insert into audit_logs (actor_user_id, action, entity_type, entity_id, created_at)
         select $1::uuid, 'login_notifications.read', 'login_notification', target.id, clock_timestamp()
         from audit_logs target
         where target.id = $2::uuid and target.action = 'learner.login'
           and not exists (
             select 1 from audit_logs ack join audit_logs previous on previous.id = ack.entity_id
             where ack.action = 'login_notifications.read' and ack.entity_type = 'login_notification'
               and ack.actor_user_id = $1::uuid and previous.action = 'learner.login'
               and (previous.created_at, previous.id) >= (target.created_at, target.id)
           )`,
        [adminUserId, throughId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

function safeDisplayName(name: string, kind: "trainee" | "visitor"): string {
  const value = name?.trim();
  return value && !value.includes("@") ? value : kind === "trainee" ? "متدرب" : "زائر";
}
