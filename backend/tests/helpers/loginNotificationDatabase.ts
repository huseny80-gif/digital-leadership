import { createHash } from "node:crypto";
import type { Pool } from "pg";

interface AuditEntry {
  id: string;
  action: "learner.login" | "login_notifications.read";
  actorUserId: string | null;
  entityType: string;
  entityId: string | null;
  fingerprint?: string;
  enteredAt: string;
}
interface VisibleEntry extends AuditEntry {
  kind: "trainee" | "visitor";
  name: string;
}

/** Transaction/lock test double, never a database connection. Entries are
 * invisible to other connections until commit, and each advisory lock is held
 * through commit/rollback. This deliberately yields before INSERT so a missing
 * lock allows two concurrent requests to observe the same absent fingerprint. */
export class LoginNotificationDatabase {
  readonly users = new Map<string, { name: string; role: string; status: string }>();
  readonly guests = new Map<string, { name: string; status: string; expiresAt: string | null }>();
  readonly entries: AuditEntry[] = [];
  readonly calls: Array<{ connection: number; sql: string; values: unknown[] }> = [];
  failNextInsert = false;
  private sequence = 0;
  private connections = 0;
  private readonly locks = new Map<string, Promise<void>>();

  readonly pool = {
    query: async (sql: string, values: unknown[] = []) => this.query(0, sql, values, []),
    connect: async () => {
      const connection = ++this.connections;
      const staged: AuditEntry[] = [];
      let unlock: (() => void) | undefined;
      let active = false;
      return {
        query: async (sql: string, values: unknown[] = []) => {
          const normalized = sql.trim().toLowerCase();
          if (normalized.startsWith("begin")) {
            this.calls.push({ connection, sql, values });
            active = true;
            return { rows: [], rowCount: 0 };
          }
          if (normalized === "commit" || normalized === "rollback") {
            this.calls.push({ connection, sql, values });
            if (normalized === "commit") this.entries.push(...staged);
            staged.length = 0;
            active = false;
            unlock?.();
            unlock = undefined;
            return { rows: [], rowCount: 0 };
          }
          if (normalized.includes("pg_advisory_xact_lock")) {
            if (!active) throw new Error("Transaction lock outside transaction");
            this.calls.push({ connection, sql, values });
            unlock = await this.lock(String(values[0]));
            return { rows: [], rowCount: 0 };
          }
          if (!active) throw new Error("Transaction query outside transaction");
          return this.query(connection, sql, values, staged);
        },
        release: () => {
          if (active) throw new Error("Connection released before commit/rollback");
          unlock?.();
        },
      };
    },
  } as unknown as Pick<Pool, "query" | "connect">;

  private async lock(key: string): Promise<() => void> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(key, previous.then(() => pending));
    await previous;
    return release;
  }

  private visibleEntries(): VisibleEntry[] {
    return this.entries.filter((entry) => entry.action === "learner.login").flatMap<VisibleEntry>((entry) => {
      if (entry.entityType === "user") {
        const user = this.users.get(entry.entityId!);
        return user?.role === "user" ? [{ ...entry, kind: "trainee" as const, name: user.name }] : [];
      }
      const guest = [...this.guests.entries()].find(([id]) => guestFingerprint(id) === entry.fingerprint)?.[1];
      return guest ? [{ ...entry, kind: "visitor" as const, name: guest.name }] : [];
    });
  }

  private newEntry(values: Omit<AuditEntry, "id" | "enteredAt">): AuditEntry {
    const sequence = ++this.sequence;
    return {
      ...values,
      id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      enteredAt: new Date(Date.UTC(2026, 10, 8, 12, 0, 0, sequence)).toISOString(),
    };
  }

  private async query(connection: number, sql: string, values: unknown[], staged: AuditEntry[]) {
    this.calls.push({ connection, sql, values });
    const normalized = sql.toLowerCase();
    if (normalized.includes("insert into audit_logs") && normalized.includes("'learner.login'")) {
      if (this.failNextInsert) { this.failNextInsert = false; throw new Error("Synthetic insert failure"); }
      // ACK inserts also refer to learner.login; distinguish their SELECT shape.
      if (normalized.includes("'login_notifications.read'")) {
        const adminUserId = String(values[0]);
        const target = this.entries.find((entry) => entry.id === values[1] && entry.action === "learner.login");
        if (!target) return { rows: [], rowCount: 0 };
        const prior = this.entries.filter((entry) => entry.action === "login_notifications.read" && entry.actorUserId === adminUserId)
          .flatMap((entry) => this.entries.filter((candidate) => candidate.id === entry.entityId));
        if (normalized.includes("not exists") && prior.some((entry) => compare(entry, target) >= 0)) return { rows: [], rowCount: 0 };
        staged.push(this.newEntry({ action: "login_notifications.read", actorUserId: adminUserId, entityType: "login_notification", entityId: target.id }));
        return { rows: [], rowCount: 1 };
      }
      const [actor, entityType, principalId, fingerprint] = values as [string | null, string, string, string];
      const user = this.users.get(principalId);
      const guest = this.guests.get(principalId);
      const usable = entityType === "user"
        ? user?.role === "user" && user.status === "active"
        : guest?.status === "active" && (guest.expiresAt === null || Date.parse(guest.expiresAt) > Date.now()) && guestFingerprint(principalId) === fingerprint;
      if (!usable) return { rows: [], rowCount: 0 };
      const duplicate = [...this.entries, ...staged].some((entry) => entry.action === "learner.login" && entry.entityType === entityType && entry.fingerprint === fingerprint);
      // The missing-lock regression must remain observable, not accidentally
      // hidden by synchronous execution of this in-memory model.
      await Promise.resolve();
      if (normalized.includes("not exists") && duplicate) return { rows: [], rowCount: 0 };
      const entry = this.newEntry({ action: "learner.login", actorUserId: actor, entityType, entityId: entityType === "user" ? principalId : null, fingerprint });
      staged.push(entry);
      return { rows: [{ id: entry.id }], rowCount: 1 };
    }
    if (normalized.includes("unread_count")) {
      const visible = this.visibleEntries().sort((a, b) => compare(b, a));
      const acknowledged = this.entries.filter((entry) => entry.action === "login_notifications.read" && entry.actorUserId === values[0])
        .flatMap((entry) => this.entries.filter((target) => target.id === entry.entityId)).sort((a, b) => compare(b, a))[0];
      const read = (entry: AuditEntry) => !!acknowledged && compare(entry, acknowledged) <= 0;
      return { rows: [{
        items: visible.slice(0, 20).map((entry) => ({ id: entry.id, kind: entry.kind, display_name: entry.name, entered_at: entry.enteredAt, read: read(entry) })),
        unread_count: String(visible.filter((entry) => !read(entry)).length),
        latest_id: visible[0]?.id ?? null,
      }], rowCount: 1 };
    }
    if (normalized.includes("select id from entries where id")) {
      const target = this.visibleEntries().find((entry) => entry.id === values[0]);
      return { rows: target ? [{ id: target.id }] : [], rowCount: target ? 1 : 0 };
    }
    throw new Error("Unexpected mock SQL operation");
  }
}

function compare(a: AuditEntry, b: AuditEntry): number {
  return a.enteredAt.localeCompare(b.enteredAt) || a.id.localeCompare(b.id);
}

export function guestFingerprint(id: string): string {
  return createHash("sha256").update(`guest:${id}`).digest("hex");
}
