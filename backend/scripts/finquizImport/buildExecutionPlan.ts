import { randomUUID } from "node:crypto";
import type { FinquizQuestion, FinquizSubject } from "./types.js";
import { resolveSubjectId } from "./subjectMapping.js";

/** One statement in the prepared execution script. Always INSERT — no
 * other operation type exists in this module, by construction (Phase
 * 20.2-B: "additive-only import", "no DELETE", "no TRUNCATE", "no
 * UPDATE on existing learner data"). */
export interface InsertStatement {
  id: string;
  table: string;
  sql: string;
  params: unknown[];
  /** statement ids this one's params reference — for dependency-order
   * validation in the simulator. */
  dependsOn: string[];
  sourceId: string;
}

export interface SkippedForPhase202 {
  sourceId: string;
  category: string;
  reason: string;
}

export interface ExecutionPlan {
  statements: InsertStatement[];
  skipped: SkippedForPhase202[];
  countsByTable: Record<string, number>;
}

const QUESTION_TYPE_MAP: Record<FinquizQuestion["type"], string> = {
  mcq: "multiple_choice",
  tf: "true_false",
  fill: "fill",
  match: "match",
  order: "order",
  open: "open",
};

/**
 * Builds the exact ordered set of INSERT statements Phase 20.2-B would
 * execute, entirely offline (no database contact). Scope is the
 * Phase 20.2-B approved list:
 *   IN:  lectures, real PDF lecture files, assignments, question_banks,
 *        quizzes, questions (+explanation+rubric), question_options,
 *        question_accepted_answers, question_pairs, question_items,
 *        quiz_questions.
 *   OUT: legacy HTML / any non-PDF or null-URL file, summaries,
 *        references, resources, updates, lecture.objectives,
 *        assignment.difficulty/due, question.lectureId.
 * No `subjects` row is ever created — every subject reference resolves
 * through `resolveSubjectId` against the approved mapping only.
 */
export function buildExecutionPlan(subjects: FinquizSubject[]): ExecutionPlan {
  const statements: InsertStatement[] = [];
  const skipped: SkippedForPhase202[] = [];
  const idFor = new Map<string, string>(); // Finquiz sourceId -> generated production uuid

  function newId(sourceId: string): string {
    const id = randomUUID();
    idFor.set(sourceId, id);
    return id;
  }

  for (const subject of subjects) {
    const subjectId = resolveSubjectId(subject.id); // throws if unmapped — never guesses

    for (const lecture of subject.lectures ?? []) {
      const lectureId = newId(lecture.id);
      statements.push({
        id: `lecture:${lecture.id}`,
        table: "lectures",
        sql: `insert into lectures (id, subject_id, title, description, status, order_index, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
        params: [lectureId, subjectId, lecture.title, lecture.description ?? null, lecture.status ?? "draft", lecture.number ?? 0, "<admin_user_id>"],
        dependsOn: [],
        sourceId: lecture.id,
      });

      if (lecture.objectives?.length) {
        skipped.push({ sourceId: lecture.id, category: "lectures.objectives", reason: "No production column — Phase 19 §3.4." });
      }

      for (const file of lecture.files ?? []) {
        if (!file.url) {
          skipped.push({ sourceId: lecture.id, category: "lectures.files.null-url", reason: `"${file.label ?? file.type}" has url:null.` });
          continue;
        }
        if (file.type !== "pdf") {
          skipped.push({
            sourceId: lecture.id,
            category: file.type === "link" ? "lectures.files.legacy-html" : "lectures.files.unsupported-type",
            reason: `"${file.label ?? file.type}" is type="${file.type}" (${file.type === "link" ? "an HTML content page" : "not a PDF"}) — excluded from Phase 20.2-B's "real PDF files only" scope.`,
          });
          continue;
        }
        const fileRowId = newId(`${lecture.id}:file:${file.url}`);
        statements.push({
          id: `file:${lecture.id}:${file.url}`,
          table: "files",
          sql: `insert into files (id, storage_key, original_filename, mime_type, size_bytes, uploaded_by) values ($1, $2, $3, $4, $5, $6)`,
          params: [fileRowId, `PENDING_UPLOAD:${file.url}`, file.url.split("/").pop(), "application/pdf", null, "<admin_user_id>"],
          dependsOn: [],
          sourceId: lecture.id,
        });
        statements.push({
          id: `lecture_item:${lecture.id}:${file.url}`,
          table: "lecture_items",
          sql: `insert into lecture_items (id, lecture_id, item_type, title, status, file_id, order_index) values ($1, $2, $3, $4, $5, $6, $7)`,
          params: [randomUUID(), lectureId, "pdf", file.label ?? lecture.title, lecture.status ?? "draft", fileRowId, 0],
          dependsOn: [`lecture:${lecture.id}`, `file:${lecture.id}:${file.url}`],
          sourceId: lecture.id,
        });
      }
    }

    for (const summary of subject.summaries ?? []) {
      skipped.push({ sourceId: summary.id, category: "summaries", reason: "Deferred — not in Phase 20.2-B scope." });
    }

    for (const assignment of subject.assignments ?? []) {
      const assignmentId = newId(assignment.id);
      statements.push({
        id: `assignment:${assignment.id}`,
        table: "assignments",
        sql: `insert into assignments (id, subject_id, lecture_id, title, description, status, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
        params: [assignmentId, subjectId, null, assignment.title, assignment.description ?? null, assignment.status ?? "draft", "<admin_user_id>"],
        dependsOn: [],
        sourceId: assignment.id,
      });
      if (assignment.difficulty) skipped.push({ sourceId: assignment.id, category: "assignments.difficulty", reason: "No production column — Phase 19 §3.5." });
      if (assignment.due) skipped.push({ sourceId: assignment.id, category: "assignments.due", reason: "No production column — Phase 19 §3.5." });
      // Assignment file attachments in this dataset are xlsx/pptx templates
      // or null — never a real PDF — so under "real PDF files only" they
      // are always excluded here; recorded for completeness only.
      for (const file of assignment.files ?? []) {
        skipped.push({
          sourceId: assignment.id,
          category: file.url ? "assignments.files.unsupported-type" : "assignments.files.null-url",
          reason: `"${file.label ?? file.type}" (type="${file.type}") is not a real PDF — outside Phase 20.2-B scope.`,
        });
      }
    }

    for (const quiz of subject.quizzes ?? []) {
      const bankId = newId(`${quiz.id}:bank`);
      statements.push({
        id: `bank:${quiz.id}`,
        table: "question_banks",
        sql: `insert into question_banks (id, subject_id, title, created_by) values ($1, $2, $3, $4)`,
        params: [bankId, subjectId, quiz.title, "<admin_user_id>"],
        dependsOn: [],
        sourceId: quiz.id,
      });
      const quizId = newId(quiz.id);
      statements.push({
        id: `quiz:${quiz.id}`,
        table: "quizzes",
        sql: `insert into quizzes (id, subject_id, title, description, status, created_by) values ($1, $2, $3, $4, $5, $6)`,
        params: [quizId, subjectId, quiz.title, quiz.description ?? null, quiz.status ?? "draft", "<admin_user_id>"],
        dependsOn: [],
        sourceId: quiz.id,
      });

      quiz.questions.forEach((question, orderIndex) => {
        const questionId = newId(question.id);
        statements.push({
          id: `question:${question.id}`,
          table: "questions",
          sql: `insert into questions (id, question_bank_id, question_type, prompt, explanation, rubric, created_by) values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          params: [
            questionId,
            bankId,
            QUESTION_TYPE_MAP[question.type],
            question.prompt,
            question.explanation ?? null,
            question.type === "open" ? JSON.stringify(question.rubric ?? null) : null,
            "<admin_user_id>",
          ],
          dependsOn: [`bank:${quiz.id}`],
          sourceId: question.id,
        });

        if (question.lectureId) {
          skipped.push({ sourceId: question.id, category: "questions.lectureId", reason: "No FK column exists — Phase 19 §3.6." });
        }

        statements.push(...buildQuestionChildRows(question, questionId));

        statements.push({
          id: `quiz_question:${quiz.id}:${question.id}`,
          table: "quiz_questions",
          // quiz_questions has a composite primary key (quiz_id, question_id)
          // — no `id` column exists (verified against migration 7 after
          // this was caught failing against real production).
          sql: `insert into quiz_questions (quiz_id, question_id, order_index) values ($1, $2, $3)`,
          params: [quizId, questionId, orderIndex],
          dependsOn: [`quiz:${quiz.id}`, `question:${question.id}`],
          sourceId: question.id,
        });
      });
    }

    for (const reference of subject.references ?? []) {
      skipped.push({ sourceId: reference.id, category: "references", reason: "Deferred — not in Phase 20.2-B scope." });
    }
    for (const resource of subject.resources ?? []) {
      skipped.push({ sourceId: resource.id, category: "resources", reason: "Deferred — not in Phase 20.2-B scope." });
    }
    for (const update of subject.updates ?? []) {
      skipped.push({ sourceId: update.id, category: "updates", reason: "Deferred — not in Phase 20.2-B scope." });
    }
  }

  const countsByTable: Record<string, number> = {};
  for (const s of statements) countsByTable[s.table] = (countsByTable[s.table] ?? 0) + 1;

  return { statements, skipped, countsByTable };
}

function buildQuestionChildRows(question: FinquizQuestion, questionId: string): InsertStatement[] {
  const rows: InsertStatement[] = [];
  const dep = [`question:${question.id}`];

  if (question.type === "mcq" && question.options) {
    const answerIndex = typeof question.answer === "number" ? question.answer : null;
    question.options.forEach((optionText, i) => {
      rows.push({
        id: `option:${question.id}:${i}`,
        table: "question_options",
        sql: `insert into question_options (id, question_id, option_text, is_correct, order_index) values ($1, $2, $3, $4, $5)`,
        params: [randomUUID(), questionId, optionText, i === answerIndex, i],
        dependsOn: dep,
        sourceId: question.id,
      });
    });
  }

  if (question.type === "tf") {
    const isTrue = question.answer === true;
    rows.push(
      {
        id: `option:${question.id}:true`,
        table: "question_options",
        sql: `insert into question_options (id, question_id, option_text, is_correct, order_index) values ($1, $2, $3, $4, $5)`,
        params: [randomUUID(), questionId, "True", isTrue, 0],
        dependsOn: dep,
        sourceId: question.id,
      },
      {
        id: `option:${question.id}:false`,
        table: "question_options",
        sql: `insert into question_options (id, question_id, option_text, is_correct, order_index) values ($1, $2, $3, $4, $5)`,
        params: [randomUUID(), questionId, "False", !isTrue, 1],
        dependsOn: dep,
        sourceId: question.id,
      },
    );
  }

  if (question.type === "fill" && Array.isArray(question.answer)) {
    question.answer.forEach((answerText, i) => {
      rows.push({
        id: `accepted_answer:${question.id}:${i}`,
        table: "question_accepted_answers",
        sql: `insert into question_accepted_answers (id, question_id, answer_text, order_index) values ($1, $2, $3, $4)`,
        params: [randomUUID(), questionId, answerText, i],
        dependsOn: dep,
        sourceId: question.id,
      });
    });
  }

  if (question.type === "match" && question.pairs) {
    question.pairs.forEach((pair, i) => {
      rows.push({
        id: `pair:${question.id}:${i}`,
        table: "question_pairs",
        sql: `insert into question_pairs (id, question_id, left_text, right_text, order_index) values ($1, $2, $3, $4, $5)`,
        params: [randomUUID(), questionId, pair.left, pair.right, i],
        dependsOn: dep,
        sourceId: question.id,
      });
    });
  }

  if (question.type === "order" && question.items) {
    question.items.forEach((itemText, i) => {
      rows.push({
        id: `item:${question.id}:${i}`,
        table: "question_items",
        sql: `insert into question_items (id, question_id, item_text, correct_order_index) values ($1, $2, $3, $4)`,
        params: [randomUUID(), questionId, itemText, i],
        dependsOn: dep,
        sourceId: question.id,
      });
    });
  }

  return rows;
}
