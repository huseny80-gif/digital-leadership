import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { createUser } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(async () => { await pool.end(); });

describe("complete, repeatable source content import", () => {
  it("imports all six question types and retains existing edits and learner progress on a second run", async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("This test requires an isolated test database.");
    const existing = await pool.query("select id from subjects where id = any($1::uuid[])", [Object.values(subjectMapping)]);
    if (existing.rows.length) throw new Error("This test requires a database without the production source subjects.");
    const owner = await createUser(pool, { email: "finquiz-import-fixture@example.test", roleName: "admin", providerSubject: "finquiz-import-fixture" });
    for (const source of manifest.subjects) await pool.query("insert into subjects (id,title,status,created_by) values ($1,$2,'published',$3)", [subjectMapping[source.id], source.title, owner]);
    const first = await synchronizeFinquizCore(pool);
    expect(first.inserted).toEqual({ lectures: 25, assignments: 52, quizzes: 5, questions: 187 });
    const types = await pool.query("select distinct question_type from questions q join question_banks b on b.id = q.question_bank_id where b.subject_id = any($1::uuid[])", [Object.values(subjectMapping)]);
    expect(types.rows.map(r => r.question_type).sort()).toEqual(["fill", "match", "multiple_choice", "open", "order", "true_false"]);
    const question = (await pool.query("select q.id from questions q join question_banks b on b.id=q.question_bank_id where b.subject_id=$1 limit 1", [subjectMapping["ai-data"]])).rows[0];
    const lecture = (await pool.query("select id from lectures where subject_id=$1 limit 1", [subjectMapping["ai-data"]])).rows[0];
    const legal = manifest.subjects.find(source => source.id === "legal-regulatory")!.lectures[0]!;
    await pool.query("update lectures set title=$2 where subject_id=$1 and title=$3", [subjectMapping["legal-regulatory"], legal.legacyTitles![0], legal.title]);
    await pool.query("update lectures set title='Instructor lecture edit preserved' where id=$1", [lecture.id]);
    await pool.query("update questions set explanation='Teacher edit preserved', prompt='Teacher prompt edit preserved' where id=$1", [question.id]);
    await pool.query("insert into lecture_progress (user_id,lecture_id,completed,completed_at) values ($1,$2,true,now())", [owner, lecture.id]);
    expect((await synchronizeFinquizCore(pool)).inserted).toEqual({ lectures: 0, assignments: 0, quizzes: 0, questions: 0 });
    expect((await pool.query("select explanation from questions where id=$1", [question.id])).rows[0].explanation).toBe("Teacher edit preserved");
    expect((await pool.query("select completed from lecture_progress where user_id=$1 and lecture_id=$2", [owner, lecture.id])).rows[0].completed).toBe(true);
    expect((await pool.query("select title from lectures where id=$1", [lecture.id])).rows[0].title).toBe("Instructor lecture edit preserved");
  }, 30000);
});
