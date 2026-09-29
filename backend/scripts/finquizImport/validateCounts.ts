import type { FinquizSubject } from "./types.js";
import type { ExecutionPlan } from "./buildExecutionPlan.js";

export interface CountValidation {
  table: string;
  expected: number;
  actual: number;
  matches: boolean;
  basis: string;
}

/**
 * Independently recomputes the expected row count for each table
 * directly from the parsed Finquiz source (not from the plan builder's
 * own bookkeeping) and compares it against `plan.countsByTable`.
 *
 * Added in Phase 20.2-B corrections: the previous report flagged
 * `question_accepted_answers: 34` as a suspected bug because it happened
 * to numerically match the unrelated `open`-question count (34) — a
 * coincidence I did not verify against the source before flagging.
 * Direct verification (summing every `fill` question's `answer` array
 * length: 15 fill questions, totalling 34 accepted-answer strings)
 * confirms 34 is correct. This module exists so that verification is
 * never done by eyeballing again — every count below is derived fresh
 * from source data, independently of the code path that generated the
 * plan, and any real mismatch fails loudly instead of being guessed at.
 */
export function validateCounts(subjects: FinquizSubject[], plan: ExecutionPlan): CountValidation[] {
  const results: CountValidation[] = [];

  const check = (table: string, expected: number, basis: string) => {
    const actual = plan.countsByTable[table] ?? 0;
    results.push({ table, expected, actual, matches: expected === actual, basis });
  };

  const allQuestions = subjects.flatMap((s) => (s.quizzes ?? []).flatMap((q) => q.questions));
  const fillQuestions = allQuestions.filter((q) => q.type === "fill");
  const mcqQuestions = allQuestions.filter((q) => q.type === "mcq");
  const tfQuestions = allQuestions.filter((q) => q.type === "tf");
  const matchQuestions = allQuestions.filter((q) => q.type === "match");
  const orderQuestions = allQuestions.filter((q) => q.type === "order");

  const realPdfLectureFiles = subjects.flatMap((s) =>
    (s.lectures ?? []).flatMap((l) => (l.files ?? []).filter((f) => f.type === "pdf" && !!f.url)),
  );

  check("lectures", subjects.reduce((n, s) => n + (s.lectures?.length ?? 0), 0), "sum of subject.lectures.length across all 5 subjects");
  check("files", realPdfLectureFiles.length, "count of lecture files with type='pdf' and a non-null url");
  check("lecture_items", realPdfLectureFiles.length, "one lecture_item per real PDF file (1:1 with 'files' above)");
  check("assignments", subjects.reduce((n, s) => n + (s.assignments?.length ?? 0), 0), "sum of subject.assignments.length across all 5 subjects");
  check("question_banks", subjects.reduce((n, s) => n + (s.quizzes?.length ?? 0), 0), "one question_bank per Finquiz quiz");
  check("quizzes", subjects.reduce((n, s) => n + (s.quizzes?.length ?? 0), 0), "one production quiz per Finquiz quiz");
  check("questions", allQuestions.length, "sum of all quiz.questions.length across all 5 subjects' quizzes");
  check(
    "question_options",
    mcqQuestions.reduce((n, q) => n + (q.options?.length ?? 0), 0) + tfQuestions.length * 2,
    "sum of each mcq question's options.length, plus 2 synthetic options per true/false question",
  );
  check(
    "question_accepted_answers",
    fillQuestions.reduce((n, q) => n + (Array.isArray(q.answer) ? q.answer.length : 0), 0),
    "sum of each fill question's answer[].length (verified 15 fill questions → 34 total accepted-answer strings)",
  );
  check("question_pairs", matchQuestions.reduce((n, q) => n + (q.pairs?.length ?? 0), 0), "sum of each match question's pairs.length");
  check("question_items", orderQuestions.reduce((n, q) => n + (q.items?.length ?? 0), 0), "sum of each order question's items.length");
  check("quiz_questions", allQuestions.length, "one quiz_questions row per question (1:1 with 'questions' above)");

  return results;
}
