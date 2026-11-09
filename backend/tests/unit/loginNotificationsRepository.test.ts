import { describe, expect, it } from "vitest";
import { LoginNotificationsRepository } from "../../src/notifications/loginNotificationsRepository.js";
import { LoginNotificationDatabase, guestFingerprint } from "../helpers/loginNotificationDatabase.js";

const USER_ID = "ec5562e4-911a-4b83-883c-a9b4ee4c4a9e";
const GUEST_ID = "b0720a83-e2dd-46ba-b47f-4d2f495bd8f0";
const ADMIN_ONE = "d5c09bea-f876-4e52-8ddf-dce41e300daa";
const ADMIN_TWO = "86adbfa3-78be-4f8e-9bd0-8ad99af36375";

function setup() {
  const database = new LoginNotificationDatabase();
  database.users.set(USER_ID, { name: "المتدرب الحقيقي", role: "user", status: "active" });
  database.guests.set(GUEST_ID, { name: "الزائر الحقيقي", status: "active", expiresAt: null });
  return { database, repository: new LoginNotificationsRepository(database.pool) };
}

describe("login notification persistence", () => {
  it("atomically records one event across concurrent retries, refreshes, and later resumes", async () => {
    const { database, repository } = setup();
    const entry = { kind: "trainee" as const, principalId: USER_ID, fingerprint: "a".repeat(64) };
    const results = await Promise.all(Array.from({ length: 12 }, () => repository.recordEntry(entry)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repository.recordEntry(entry)).toBe(false);
    expect(database.entries).toHaveLength(1);
    const insert = database.calls.find((call) => call.sql.includes("insert into audit_logs"))!;
    const transaction = database.calls.filter((call) => call.connection === insert.connection);
    expect(transaction.map((call) => call.sql.trim().split(/\s+/)[0])).toEqual(["begin", "select", "insert", "commit"]);
    expect(transaction[0]!.sql).toBe("begin isolation level read committed");
    expect(transaction[1]!.sql).toContain("pg_advisory_xact_lock(hashtextextended($1, 0))");
    expect(transaction[1]!.values).toEqual(["learner.login.append"]);
    expect(insert.sql).toContain("where not exists");
    expect(insert.sql).toContain("existing.metadata->>'sessionFingerprint' = $4::text");
    expect(insert.sql).toContain("clock_timestamp()");
    expect(insert.sql).toContain("max(created_at) + interval '1 microsecond'");
    expect(insert.sql).toContain("u.status = 'active' and r.name = 'user'");
    expect(await repository.recordEntry({ ...entry, fingerprint: "b".repeat(64) })).toBe(true);
    expect(database.entries).toHaveLength(2);
  });

  it("resumes one verified guest session once and persists only its fingerprint", async () => {
    const { database, repository } = setup();
    const guest = { kind: "visitor" as const, principalId: GUEST_ID, fingerprint: guestFingerprint(GUEST_ID) };
    expect((await Promise.all(Array.from({ length: 6 }, () => repository.recordEntry(guest)))).filter(Boolean)).toHaveLength(1);
    const stored = database.entries[0]!;
    expect(stored.actorUserId).toBeNull();
    expect(stored.entityId).toBeNull();
    expect(JSON.stringify(stored)).not.toContain(GUEST_ID);
    expect(JSON.stringify(stored)).not.toContain("الزائر الحقيقي");
    expect((await repository.feed(ADMIN_ONE)).items[0]).toMatchObject({ kind: "visitor", displayName: "الزائر الحقيقي" });
  });

  it("rechecks the database role/status and guest source binding immediately before inserting", async () => {
    const { database, repository } = setup();
    database.users.set(USER_ID, { name: "موظف", role: "admin", status: "active" });
    expect(await repository.recordEntry({ kind: "trainee", principalId: USER_ID, fingerprint: "a".repeat(64) })).toBe(false);
    database.users.set(USER_ID, { name: "متوقف", role: "user", status: "suspended" });
    expect(await repository.recordEntry({ kind: "trainee", principalId: USER_ID, fingerprint: "a".repeat(64) })).toBe(false);
    expect(await repository.recordEntry({ kind: "visitor", principalId: GUEST_ID, fingerprint: "a".repeat(64) })).toBe(false);
    database.guests.set(GUEST_ID, { name: "قديم", status: "active", expiresAt: "2000-01-01T00:00:00Z" });
    expect(await repository.recordEntry({ kind: "visitor", principalId: GUEST_ID, fingerprint: guestFingerprint(GUEST_ID) })).toBe(false);
    expect(database.entries).toHaveLength(0);
  });

  it("rolls back and releases the transaction lock after a failed insert so retry can succeed", async () => {
    const { database, repository } = setup();
    const entry = { kind: "trainee" as const, principalId: USER_ID, fingerprint: "a".repeat(64) };
    database.failNextInsert = true;
    await expect(repository.recordEntry(entry)).rejects.toThrow("Synthetic insert failure");
    expect(database.entries).toHaveLength(0);
    expect(database.calls.at(-1)?.sql).toBe("rollback");
    expect(await repository.recordEntry(entry)).toBe(true);
  });

  it("returns the newest 20 with the authoritative unread count and current source names", async () => {
    const { database, repository } = setup();
    for (let i = 0; i < 25; i++) {
      await repository.recordEntry({ kind: "trainee", principalId: USER_ID, fingerprint: String(i).padStart(64, "0") });
    }
    database.users.get(USER_ID)!.name = "اسم محدث";
    const feed = await repository.feed(ADMIN_ONE);
    expect(feed.items).toHaveLength(20);
    expect(feed.unreadCount).toBe(25);
    expect(feed.latestId).toBe(feed.items[0]!.id);
    expect(feed.items.every((item) => !item.read && item.displayName === "اسم محدث")).toBe(true);
    expect(feed.items[0]!.enteredAt > feed.items.at(-1)!.enteredAt).toBe(true);
    expect(database.calls.at(-1)!.sql).toContain("limit 20");
    expect(database.calls.at(-1)!.sql).toContain("count(*)::text from marked where not read");
  });

  it("acknowledges only through the displayed snapshot, persists per admin and never regresses", async () => {
    const { database, repository } = setup();
    const enter = (fingerprint: string) => repository.recordEntry({ kind: "trainee", principalId: USER_ID, fingerprint });
    await enter("a".repeat(64));
    const oldestId = (await repository.feed(ADMIN_ONE)).latestId!;
    await enter("b".repeat(64));
    const snapshot = await repository.feed(ADMIN_ONE);
    await enter("c".repeat(64));
    await repository.acknowledge(ADMIN_ONE, snapshot.latestId!);
    const reloaded = await new LoginNotificationsRepository(database.pool).feed(ADMIN_ONE);
    expect(reloaded.unreadCount).toBe(1);
    expect(reloaded.items.map((item) => item.read)).toEqual([false, true, true]);
    expect((await repository.feed(ADMIN_TWO)).unreadCount).toBe(3);
    // Concurrent stale/new ACKs leave the highest watermark in place.
    await Promise.all([repository.acknowledge(ADMIN_ONE, oldestId), repository.acknowledge(ADMIN_ONE, reloaded.latestId!)]);
    await repository.acknowledge(ADMIN_ONE, oldestId);
    expect((await repository.feed(ADMIN_ONE)).unreadCount).toBe(0);
    expect(database.entries.filter((entry) => entry.action === "login_notifications.read")).toHaveLength(2);
    const ackInsert = database.calls.find((call) => call.sql.includes("insert into audit_logs") && call.sql.includes("'login_notifications.read'"))!;
    expect(ackInsert.sql).toContain("(previous.created_at, previous.id) >= (target.created_at, target.id)");
    expect(ackInsert.values).toEqual([ADMIN_ONE, snapshot.latestId]);
  });

  it("rejects an unknown or non-entry cursor without creating a read record", async () => {
    const { database, repository } = setup();
    await expect(repository.acknowledge(ADMIN_ONE, GUEST_ID)).rejects.toMatchObject({ status: 404 });
    await repository.recordEntry({ kind: "trainee", principalId: USER_ID, fingerprint: "a".repeat(64) });
    await repository.acknowledge(ADMIN_ONE, (await repository.feed(ADMIN_ONE)).latestId!);
    const ack = database.entries.find((entry) => entry.action === "login_notifications.read")!;
    await expect(repository.acknowledge(ADMIN_ONE, ack.id)).rejects.toMatchObject({ status: 404 });
    expect(database.entries.filter((entry) => entry.action === "login_notifications.read")).toHaveLength(1);
    expect(database.calls.at(-1)?.sql).toBe("rollback");
  });

  it("exposes no contacts, raw session IDs, fingerprints, or audit metadata in the feed", async () => {
    const { database, repository } = setup();
    database.users.get(USER_ID)!.name = "private@example.test";
    database.guests.get(GUEST_ID)!.name = "اسم private@example.test";
    await repository.recordEntry({ kind: "trainee", principalId: USER_ID, fingerprint: "a".repeat(64) });
    await repository.recordEntry({ kind: "visitor", principalId: GUEST_ID, fingerprint: guestFingerprint(GUEST_ID) });
    const feed = await repository.feed(ADMIN_ONE);
    const serialized = JSON.stringify(feed);
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain(GUEST_ID);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain("a".repeat(64));
    expect(serialized).not.toContain("sessionFingerprint");
    expect(feed.items.map((item) => item.displayName)).toEqual(["زائر", "متدرب"]);
    expect(Object.keys(feed.items[0]!).sort()).toEqual(["displayName", "enteredAt", "id", "kind", "read"]);
  });
});
