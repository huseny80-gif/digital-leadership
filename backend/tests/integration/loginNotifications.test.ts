import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { LoginNotificationsRepository } from "../../src/notifications/loginNotificationsRepository.js";

// Only the explicitly selected, ephemeral local test database may be used.
// Local unit runs skip this suite unless TEST_DATABASE_URL is supplied; CI
// already creates and migrates this exact database before running all tests.
const requestedUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI === "true" ? process.env.DATABASE_URL : undefined);
if (requestedUrl) {
  let url: URL;
  try { url = new URL(requestedUrl); }
  catch { throw new Error("Login notification integration tests require a valid loopback test database URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.pathname !== "/digital_leadership_backend_test" || url.search || url.hash) {
    throw new Error("Login notification integration tests require the loopback digital_leadership_backend_test database.");
  }
}

describe.skipIf(!requestedUrl)("login notifications against migrated local PostgreSQL", () => {
  it("deduplicates concurrent entries, joins guest names by hash, and preserves each admin's snapshot ACK", async () => {
    const pool = new Pool({ connectionString: requestedUrl!, max: 12 });
    const repository = new LoginNotificationsRepository(pool);
    const userId = randomUUID();
    const adminOne = randomUUID();
    const adminTwo = randomUUID();
    const subjectId = randomUUID();
    const grantId = randomUUID();
    const guestId = randomUUID();
    const firstFingerprint = createHash("sha256").update(randomUUID()).digest("hex");
    const nextFingerprint = createHash("sha256").update(randomUUID()).digest("hex");
    const guestFingerprint = createHash("sha256").update(`guest:${guestId}`).digest("hex");
    try {
      for (const [id, role, name] of [[userId, "user", "متدرب اختبار الدخول"], [adminOne, "admin", "مدير الاختبار الأول"], [adminTwo, "admin", "مدير الاختبار الثاني"]]) {
        const inserted = await pool.query(
          `insert into users (id, email, display_name, role_id)
           select $1::uuid, $2, $3, id from roles where name = $4`,
          [id, `login-notification-${id}@example.test`, name, role],
        );
        expect(inserted.rowCount).toBe(1);
      }
      await pool.query("insert into subjects (id, title, status, created_by) values ($1, 'Login notification fixture', 'draft', $2)", [subjectId, adminOne]);
      await pool.query(
        `insert into training_access_grants (id, subject_id, token_hash, expires_at, created_by)
         values ($1, $2, $3, clock_timestamp() + interval '1 hour', $4)`,
        [grantId, subjectId, `unused-test-${grantId}`, adminOne],
      );
      await pool.query(
        `insert into guest_training_sessions (id, grant_id, display_name, expires_at)
         values ($1, $2, 'زائر اختبار الدخول', clock_timestamp() + interval '1 hour')`, [guestId, grantId],
      );
      // Existing fixtures in another suite are irrelevant to this test. Give
      // only these new admins a baseline watermark; never truncate shared data.
      for (const adminId of [adminOne, adminTwo]) {
        const previous = await repository.feed(adminId);
        if (previous.latestId) await repository.acknowledge(adminId, previous.latestId);
      }
      const entry = { kind: "trainee" as const, principalId: userId, fingerprint: firstFingerprint };
      const attempts = await Promise.all(Array.from({ length: 12 }, () => repository.recordEntry(entry)));
      expect(attempts.filter(Boolean)).toHaveLength(1);
      expect(await repository.recordEntry(entry)).toBe(false);
      const snapshot = await repository.feed(adminOne);
      expect(snapshot.unreadCount).toBe(1);
      expect(snapshot.items[0]).toMatchObject({ kind: "trainee", displayName: "متدرب اختبار الدخول", read: false });

      expect(await repository.recordEntry({ ...entry, fingerprint: nextFingerprint })).toBe(true);
      await repository.acknowledge(adminOne, snapshot.latestId!);
      const afterAck = await new LoginNotificationsRepository(pool).feed(adminOne);
      expect(afterAck.unreadCount).toBe(1);
      expect(afterAck.items.slice(0, 2).map((item) => item.read)).toEqual([false, true]);
      expect((await repository.feed(adminTwo)).unreadCount).toBe(2);
      await Promise.all([
        repository.acknowledge(adminOne, snapshot.latestId!),
        repository.acknowledge(adminOne, afterAck.latestId!),
      ]);
      await repository.acknowledge(adminOne, snapshot.latestId!);
      expect((await repository.feed(adminOne)).unreadCount).toBe(0);
      expect((await repository.feed(adminTwo)).unreadCount).toBe(2);

      const guest = { kind: "visitor" as const, principalId: guestId, fingerprint: guestFingerprint };
      expect((await Promise.all(Array.from({ length: 6 }, () => repository.recordEntry(guest)))).filter(Boolean)).toHaveLength(1);
      const withGuest = await repository.feed(adminOne);
      expect(withGuest.unreadCount).toBe(1);
      expect(withGuest.items[0]).toMatchObject({ kind: "visitor", displayName: "زائر اختبار الدخول", read: false });
      expect(JSON.stringify(withGuest)).not.toContain(guestId);
      expect(JSON.stringify(withGuest)).not.toContain(guestFingerprint);
      expect(JSON.stringify(withGuest)).not.toContain("@example.test");
      const guestAudit = await pool.query("select actor_user_id, entity_id, metadata from audit_logs where action = 'learner.login' and metadata->>'sessionFingerprint' = $1", [guestFingerprint]);
      expect(guestAudit.rows).toEqual([{ actor_user_id: null, entity_id: null, metadata: { sessionFingerprint: guestFingerprint } }]);
      const loginCount = await pool.query("select count(*)::int as count from audit_logs where action = 'learner.login' and actor_user_id = $1", [userId]);
      expect(loginCount.rows[0].count).toBe(2);
      const ordering = await pool.query(
        `select bool_and(previous_time is null or created_at > previous_time) as increasing
         from (select created_at, lag(created_at) over (order by created_at, id) as previous_time
               from audit_logs where action = 'learner.login'
                 and metadata->>'sessionFingerprint' = any($1::text[])) ordered`,
        [[firstFingerprint, nextFingerprint, guestFingerprint]],
      );
      expect(ordering.rows[0].increasing).toBe(true);
      await expect(repository.acknowledge(adminOne, randomUUID())).rejects.toMatchObject({ status: 404 });
    } finally {
      // Delete only this test's synthetic fixtures, after all transactions close.
      try {
        await pool.query("delete from audit_logs where actor_user_id = any($1::uuid[]) or (action = 'learner.login' and metadata->>'sessionFingerprint' = $2)", [[userId, adminOne, adminTwo], guestFingerprint]);
        await pool.query("delete from guest_training_sessions where id = $1", [guestId]);
        await pool.query("delete from training_access_grants where id = $1", [grantId]);
        await pool.query("delete from subjects where id = $1", [subjectId]);
        await pool.query("delete from users where id = any($1::uuid[])", [[userId, adminOne, adminTwo]]);
      } finally { await pool.end(); }
    }
  });
});
