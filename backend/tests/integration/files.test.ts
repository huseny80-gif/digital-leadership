import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { createLecture, createLectureItem, createSubject, createUser } from "../helpers/seedFixtures.js";

/**
 * File Storage & Secure PDF Access tests (STORAGE_TEST_PLAN.md). Run
 * against the same real local PostgreSQL database as
 * tests/integration/content.test.ts, plus the local-filesystem storage
 * substitute (no live Supabase project — see
 * STORAGE_IMPLEMENTATION.md "Live Supabase Verification Status").
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VALID_PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
const NOT_A_PDF = Buffer.from("<html><body>not a pdf</body></html>");

async function resetDatabase() {
  await pool.query(
    `truncate audit_logs, quiz_attempt_answers, quiz_attempts, quiz_questions, question_options,
     questions, question_banks, lecture_items, lectures, subjects, files, user_identities, users
     restart identity cascade`,
  );
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function seedScenario() {
  const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  const userId = await createUser(pool, { email: "user@example.com", roleName: "user", providerSubject: "user-sub" });
  const subjectId = await createSubject(pool, { title: "Mathematics", status: "published", createdBy: adminId });
  const lectureId = await createLecture(pool, { subjectId, title: "Intro", status: "published", createdBy: adminId });
  const draftLectureId = await createLecture(pool, { subjectId, title: "Draft", status: "draft", createdBy: adminId });

  const adminToken = signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" });
  const userToken = signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });

  return { adminId, userId, subjectId, lectureId, draftLectureId, adminToken, userToken };
}

describe("Upload authorization", () => {
  it("8. anonymous upload → 401", async () => {
    const { subjectId } = await seedScenario();
    const app = createApp();
    const res = await request(app).post("/api/v1/files").field("subjectId", subjectId).attach("file", VALID_PDF, "lecture1.pdf");
    expect(res.status).toBe(401);
  });

  it("9. normal user upload → 403", async () => {
    const { subjectId, userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${userToken}`)
      .field("subjectId", subjectId)
      .attach("file", VALID_PDF, "lecture1.pdf");
    expect(res.status).toBe(403);
  });

  it("10. admin upload → allowed, returns safe metadata only", async () => {
    const { subjectId, lectureId, adminToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ originalFilename: "lecture1.pdf", mimeType: "application/pdf", status: "active" });
    expect(res.body.data).not.toHaveProperty("storageKey");
    expect(res.body.data).not.toHaveProperty("storage_key");
  });

  it("3/4/21. rejects a non-PDF upload even with a spoofed filename and MIME type", async () => {
    const { subjectId, adminToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .attach("file", NOT_A_PDF, { filename: "lecture1.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("20. a client-supplied storageKey field is ignored — the path is always server-generated", async () => {
    const { subjectId, adminToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("storageKey", "../../etc/passwd")
      .attach("file", VALID_PDF, "lecture1.pdf");
    expect(res.status).toBe(201);

    const dbFile = await pool.query("select storage_key from files where id = $1", [res.body.data.id]);
    expect(dbFile.rows[0].storage_key).toMatch(new RegExp(`^subjects/${subjectId}/`));
    expect(dbFile.rows[0].storage_key).not.toContain("etc/passwd");
  });

  it("upload against a nonexistent subject is rejected (404) before any file is stored", async () => {
    const { adminToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", "bb4640c5-d082-4c38-b9bf-fc31d3e67481")
      .attach("file", VALID_PDF, "lecture1.pdf");
    expect(res.status).toBe(404);
  });
});

describe("Secure file access", () => {
  it("11. anonymous file access → 401", async () => {
    const { subjectId, lectureId, adminId, adminToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");
    const fileId = uploadRes.body.data.id;
    await createLectureItem(pool, { lectureId, itemType: "pdf", title: "Slides", status: "published", createdBy: adminId, fileId });

    const res = await request(app).get(`/api/v1/files/${fileId}`);
    expect(res.status).toBe(401);
  });

  it("12/14/23. a file not attached to any visible content is denied to a normal user (IDOR-safe 404)", async () => {
    const { subjectId, lectureId, adminToken, userToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");
    const fileId = uploadRes.body.data.id;
    // Deliberately NOT attached to any lecture_item — not visible to anyone but admin.

    const res = await request(app).get(`/api/v1/files/${fileId}`).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("12/13. a normal user is denied for a file attached only to a draft lecture, and allowed once it's published", async () => {
    const { subjectId, lectureId, draftLectureId, adminId, adminToken, userToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", draftLectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");
    const fileId = uploadRes.body.data.id;
    await createLectureItem(pool, {
      lectureId: draftLectureId,
      itemType: "pdf",
      title: "Slides",
      status: "published",
      createdBy: adminId,
      fileId,
    });

    const deniedRes = await request(app).get(`/api/v1/files/${fileId}`).set("Authorization", `Bearer ${userToken}`);
    expect(deniedRes.status).toBe(404);

    // Now attach the same file to a lecture_item under the PUBLISHED lecture instead.
    await pool.query("update lecture_items set lecture_id = $1 where file_id = $2", [lectureId, fileId]);

    const allowedRes = await request(app).get(`/api/v1/files/${fileId}`).set("Authorization", `Bearer ${userToken}`);
    expect(allowedRes.status).toBe(200);
  });

  it("13/15/16/17/18. authorized access returns a short-lived signed URL, never a permanent one, never stored in the DB", async () => {
    const { subjectId, lectureId, adminId, adminToken, userToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");
    const fileId = uploadRes.body.data.id;
    await createLectureItem(pool, { lectureId, itemType: "pdf", title: "Slides", status: "published", createdBy: adminId, fileId });

    const before = Date.now();
    const res = await request(app).get(`/api/v1/files/${fileId}`).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);

    const { url, expiresAt } = res.body.data;
    expect(url).toMatch(/token=/);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(before);
    expect(new Date(expiresAt).getTime()).toBeLessThan(before + 6 * 60 * 1000); // well within the 5-minute default

    // 17. Never stored: the `files` table has no url/signed_url column at all.
    const columnsResult = await pool.query(
      "select column_name from information_schema.columns where table_name = 'files'",
    );
    const columnNames = columnsResult.rows.map((r) => r.column_name);
    expect(columnNames.some((c) => /url/i.test(c))).toBe(false);

    // The signed URL actually works when fetched directly (no auth header needed — the token is the credential).
    const fetched = await request(app).get(new URL(url).pathname + new URL(url).search);
    expect(fetched.status).toBe(200);
    expect(fetched.headers["content-type"]).toBe("application/pdf");
  });

  it("16. an expired local signed URL is rejected", async () => {
    const { subjectId, lectureId, adminId, adminToken, userToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");
    const fileId = uploadRes.body.data.id;
    await createLectureItem(pool, { lectureId, itemType: "pdf", title: "Slides", status: "published", createdBy: adminId, fileId });

    const res = await request(app).get(`/api/v1/files/${fileId}`).set("Authorization", `Bearer ${userToken}`);
    const url = new URL(res.body.data.url);
    url.searchParams.set("expires", String(Math.floor(Date.now() / 1000) - 10)); // force expiry into the past

    const fetched = await request(app).get(url.pathname + url.search);
    expect(fetched.status).toBe(404);
  });

  it("14. a forged/nonexistent file ID → 404, not distinguishable from an unauthorized one", async () => {
    const { userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/files/bb4640c5-d082-4c38-b9bf-fc31d3e67481")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("invalid file ID → 400", async () => {
    const { userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app).get("/api/v1/files/not-a-uuid").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
  });

  it("admin can always access a file directly (own uploads, even unattached)", async () => {
    const { subjectId, lectureId, adminToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");
    const res = await request(app)
      .get(`/api/v1/files/${uploadRes.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe("Replacement lifecycle (26)", () => {
  it("creates a new active file, archives the old one, and repoints the lecture item", async () => {
    const { subjectId, lectureId, adminId, adminToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");
    const oldFileId = uploadRes.body.data.id;
    const itemId = await createLectureItem(pool, {
      lectureId,
      itemType: "pdf",
      title: "Slides",
      status: "published",
      createdBy: adminId,
      fileId: oldFileId,
    });

    const replaceRes = await request(app)
      .post(`/api/v1/files/${oldFileId}/replace`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", VALID_PDF, "lecture1-v2.pdf");
    expect(replaceRes.status).toBe(200);
    const newFileId = replaceRes.body.data.id;
    expect(newFileId).not.toBe(oldFileId);

    const oldFile = await pool.query("select status from files where id = $1", [oldFileId]);
    expect(oldFile.rows[0].status).toBe("archived");

    const item = await pool.query("select file_id from lecture_items where id = $1", [itemId]);
    expect(item.rows[0].file_id).toBe(newFileId);
  });

  it("normal user cannot replace a file", async () => {
    const { subjectId, lectureId, adminToken, userToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");

    const res = await request(app)
      .post(`/api/v1/files/${uploadRes.body.data.id}/replace`)
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", VALID_PDF, "lecture1-v2.pdf");
    expect(res.status).toBe(403);
  });
});

describe("Deletion", () => {
  it("admin can delete an unreferenced file", async () => {
    const { subjectId, adminToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .attach("file", VALID_PDF, "lecture1.pdf");

    const res = await request(app)
      .delete(`/api/v1/files/${uploadRes.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(204);

    const file = await pool.query("select status from files where id = $1", [uploadRes.body.data.id]);
    expect(file.rows[0].status).toBe("archived");
  });

  it("refuses to delete a file still referenced by a lecture item (409)", async () => {
    const { subjectId, lectureId, adminId, adminToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");
    await createLectureItem(pool, {
      lectureId,
      itemType: "pdf",
      title: "Slides",
      status: "published",
      createdBy: adminId,
      fileId: uploadRes.body.data.id,
    });

    const res = await request(app)
      .delete(`/api/v1/files/${uploadRes.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });

  it("normal user cannot delete a file", async () => {
    const { subjectId, adminToken, userToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .attach("file", VALID_PDF, "lecture1.pdf");

    const res = await request(app)
      .delete(`/api/v1/files/${uploadRes.body.data.id}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Audit logging", () => {
  it("upload, and denied access, are both audited without leaking secrets", async () => {
    const { subjectId, lectureId, adminToken, userToken } = await seedScenario();
    const app = createApp();
    const uploadRes = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("subjectId", subjectId)
      .field("lectureId", lectureId)
      .attach("file", VALID_PDF, "lecture1.pdf");

    await request(app).get(`/api/v1/files/${uploadRes.body.data.id}`).set("Authorization", `Bearer ${userToken}`);

    const auditRows = await pool.query("select action, metadata from audit_logs order by created_at");
    const actions = auditRows.rows.map((r) => r.action);
    expect(actions).toContain("file.uploaded");
    expect(actions).toContain("file.access_denied");
    expect(JSON.stringify(auditRows.rows)).not.toMatch(/token=|signed|service_role/i);
  });
});

describe("Security (19/22)", () => {
  it("22. error responses from file routes never leak internal details", async () => {
    const { userToken } = await seedScenario();
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/files/bb4640c5-d082-4c38-b9bf-fc31d3e67481")
      .set("Authorization", `Bearer ${userToken}`);
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|service_role/i);
  });
});
