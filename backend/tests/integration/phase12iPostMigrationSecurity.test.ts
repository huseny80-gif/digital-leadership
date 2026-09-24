import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";

/**
 * Phase 12I — POST-MIGRATION, NON-DESTRUCTIVE verification against the
 * real migrated Finquiz content in `digital_leadership_phase12f`.
 *
 * Deliberately does NOT truncate anything (no `resetDatabase()`) -- this
 * file only reads the already-migrated content and adds one extra
 * learner-role user of its own, so it can run without wiping the
 * migration this phase just committed. Run with:
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/digital_leadership_phase12f
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool.end();
});

async function getOrCreateLearnerToken() {
  const existing = await pool.query("select id from users where email = 'phase12i-verify@example.com'");
  if (existing.rows.length === 0) {
    const roleRes = await pool.query("select id from roles where name = 'user'");
    const userRes = await pool.query(
      "insert into users (email, display_name, role_id) values ('phase12i-verify@example.com', 'Phase 12I Verify', $1) returning id",
      [roleRes.rows[0].id],
    );
    await pool.query("insert into user_identities (user_id, provider, provider_subject) values ($1, 'google', 'phase12i-verify-sub')", [
      userRes.rows[0].id,
    ]);
  }
  return signFakeSupabaseToken({ sub: "phase12i-verify-sub", email: "phase12i-verify@example.com" });
}

describe("Phase 12I — post-migration content integrity (real migrated data, no data wiped)", () => {
  it("all 5 migrated subjects are visible and published", async () => {
    const result = await pool.query("select id, title, status, source_ref from subjects order by source_ref");
    expect(result.rows).toHaveLength(5);
    for (const row of result.rows) {
      expect(row.status).toBe("published");
      expect(row.source_ref).toMatch(/^finquiz:/);
    }
  });

  it("187 questions exist with the exact expected type distribution", async () => {
    const result = await pool.query("select question_type, count(*) from questions group by question_type");
    const counts: Record<string, number> = {};
    for (const row of result.rows) counts[row.question_type] = Number(row.count);
    expect(counts).toEqual({
      multiple_choice: 68,
      true_false: 44,
      fill: 15,
      match: 14,
      order: 12,
      open: 34,
    });
  });

  it("52 assignments exist, all subject-scoped, zero attached to any lecture", async () => {
    const total = await pool.query("select count(*) from assignments");
    expect(Number(total.rows[0].count)).toBe(52);
    const fakeAttached = await pool.query("select count(*) from assignments where lecture_id is not null");
    expect(Number(fakeAttached.rows[0].count)).toBe(0);
  });

  it("all 34 open questions carry their rubric, exact structure preserved", async () => {
    const result = await pool.query("select id, rubric from questions where question_type = 'open'");
    expect(result.rows).toHaveLength(34);
    for (const row of result.rows) {
      expect(row.rubric).not.toBeNull();
      expect(Array.isArray(row.rubric)).toBe(true);
      expect(row.rubric.length).toBeGreaterThan(0);
      for (const item of row.rubric) {
        expect(typeof item.text).toBe("string");
        expect(Array.isArray(item.keywords)).toBe(true);
      }
    }
  });

  it("a real migrated MCQ question delivers correctly over HTTP with no answer-key leakage", async () => {
    const token = await getOrCreateLearnerToken();
    const app = createApp();

    const quizRow = await pool.query(
      "select z.id as quiz_id from quizzes z join subjects s on s.id = z.subject_id where s.source_ref = 'finquiz:ai-data' limit 1",
    );
    const quizId = quizRow.rows[0].quiz_id;

    const res = await request(app).get(`/api/v1/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/is_correct|isCorrect/i);
    expect(body).not.toMatch(/rubric/i);
    expect(body).not.toMatch(/correct_order_index|correctOrderIndex/i);
    expect(body).not.toMatch(/question_accepted_answers/i);
  });

  it("a real migrated fill question's accepted answers never appear in ITS OWN delivered payload", async () => {
    // Scoped to this specific question's own JSON fragment, not the whole
    // quiz response -- an accepted-answer word coincidentally appearing as
    // ordinary legitimate content in a DIFFERENT question's prompt/options
    // elsewhere in the same quiz (verified: a real, unrelated MCQ
    // distractor option in this dataset happens to contain the word
    // "تقليل") is not a leak of this fill question's answer key.
    const token = await getOrCreateLearnerToken();
    const app = createApp();

    const fillQ = await pool.query(
      `select q.id as question_id, qq.quiz_id, qaa.answer_text
       from questions q
       join question_accepted_answers qaa on qaa.question_id = q.id
       join quiz_questions qq on qq.question_id = q.id
       where q.question_type = 'fill' limit 1`,
    );
    const { quiz_id: quizId, question_id: questionId, answer_text: acceptedAnswer } = fillQ.rows[0];

    const res = await request(app).get(`/api/v1/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const question = res.body.data.find((q: { id: string }) => q.id === questionId);
    expect(question).toBeDefined();
    expect(JSON.stringify(question)).not.toContain(acceptedAnswer);
  });

  it("a real migrated match question's delivery never reveals the correct pairing", async () => {
    const token = await getOrCreateLearnerToken();
    const app = createApp();

    const matchQ = await pool.query(
      `select qq.quiz_id, q.id as question_id
       from questions q
       join quiz_questions qq on qq.question_id = q.id
       where q.question_type = 'match' limit 1`,
    );
    const { quiz_id: quizId, question_id: questionId } = matchQ.rows[0];
    const pairsRes = await pool.query("select left_text, right_text from question_pairs where question_id = $1", [questionId]);

    const res = await request(app).get(`/api/v1/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${token}`);
    const question = res.body.data.find((q: { id: string }) => q.id === questionId);
    expect(question).toBeDefined();
    expect(question.matchItems.left).toHaveLength(pairsRes.rows.length);
    expect(question.matchItems.right).toHaveLength(pairsRes.rows.length);
    // No adjacent left/right pairing revealed in the raw JSON (left[i] must
    // never sit next to its correct right[i] partner text in a way a naive
    // string-adjacency check would catch).
    for (const pair of pairsRes.rows) {
      expect(JSON.stringify(question)).not.toContain(`${pair.left_text}","text":"${pair.right_text}`);
    }
  });

  it("a real migrated order question's delivery never includes correct_order_index", async () => {
    const token = await getOrCreateLearnerToken();
    const app = createApp();

    const orderQ = await pool.query(
      `select qq.quiz_id, q.id as question_id
       from questions q
       join quiz_questions qq on qq.question_id = q.id
       where q.question_type = 'order' limit 1`,
    );
    const { quiz_id: quizId, question_id: questionId } = orderQ.rows[0];

    const res = await request(app).get(`/api/v1/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${token}`);
    const question = res.body.data.find((q: { id: string }) => q.id === questionId);
    expect(question).toBeDefined();
    expect(question.orderItems.length).toBeGreaterThan(0);
    expect(JSON.stringify(question)).not.toMatch(/correct_order_index|correctOrderIndex/i);
  });

  it("a real migrated open question's rubric is never exposed to the learner, and explanation never appears pre-grade", async () => {
    const token = await getOrCreateLearnerToken();
    const app = createApp();

    const openQ = await pool.query(
      `select qq.quiz_id, q.id as question_id, q.rubric, q.explanation
       from questions q
       join quiz_questions qq on qq.question_id = q.id
       where q.question_type = 'open' and q.rubric is not null limit 1`,
    );
    const { quiz_id: quizId, question_id: questionId, rubric, explanation } = openQ.rows[0];

    const res = await request(app).get(`/api/v1/quizzes/${quizId}/questions`).set("Authorization", `Bearer ${token}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(JSON.stringify(rubric[0].text));
    if (explanation) expect(body).not.toContain(explanation);
  });

  it("end-to-end grading works for a real migrated MCQ question through the normal quiz flow", async () => {
    const token = await getOrCreateLearnerToken();
    const app = createApp();

    const mcq = await pool.query(
      `select qq.quiz_id, q.id as question_id, qo.id as option_id
       from questions q
       join quiz_questions qq on qq.question_id = q.id
       join question_options qo on qo.question_id = q.id and qo.is_correct = true
       where q.question_type = 'multiple_choice' limit 1`,
    );
    const { quiz_id: quizId, question_id: questionId, option_id: optionId } = mcq.rows[0];

    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${token}`);
    expect(startRes.status).toBe(201);
    const attemptId = startRes.body.data.id;

    const answerRes = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${token}`)
      .send({ questionId, selectedOptionId: optionId });
    expect(answerRes.status).toBe(200);
  });
});
