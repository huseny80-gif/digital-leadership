import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PHASE 09B "Answer-Key Leakage Test" (mandatory), extended in PHASE 09C.
 * Initial questions never contain answer keys. After a validated answer,
 * the two owned feedback views may consume SubmitAnswerAck.isCorrect.
 * This scans the rest of the learner source for unexpected correctness
 * access; runtime HTTP tests verify the before/after boundary itself.
 *
 * PHASE 09C's Admin Console legitimately displays and edits `isCorrect`
 * (an admin managing a question's answer key needs to see it — that is
 * the entire point of `AdminQuestion`/`AdminQuestionOption`,
 * ADMIN_SECURITY.md "Assessment Security"). Those files live exclusively
 * under `app/(app)/admin/` and are excluded here by design, not by
 * oversight — every one of them sits behind the backend's `requireAdmin`
 * gate (independently, regardless of this scan) and none is reachable
 * from, or imported by, any learner-facing route or component.
 *
 * The equivalent runtime check — that an actual JSON response body never
 * contains the field on a LEARNER endpoint — lives in
 * `QuizAttemptRunner.test.tsx` (renders mocked question data and asserts
 * the field is absent from the DOM) and, decisively, in the backend's own
 * `assessments.test.ts` ("11. is_correct never appears in learner
 * question responses") and `admin.test.ts` ("18. learner quiz API still
 * excludes is_correct after admin implementation"), which inspect the
 * real serialized API response rather than a TypeScript type. A source
 * scan alone would not catch a bug where the type omits the field but the
 * server accidentally serializes it anyway — that is why the backend
 * tests exist and are the authoritative check, not this one.
 */
const ADMIN_ONLY_PATH_SEGMENT = `${join("app", "(app)", "admin")}`;
// The user explicitly enabled feedback after an answer is recorded.
// Only these two views consume that owned, post-answer feedback DTO.
const POST_ANSWER_VIEWS = [join("components", "quiz", "QuizAttemptRunner.tsx"), join("quizzes", "[quizId]", "result", "[attemptId]", "page.tsx")];
function listFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") return [];
      return listFiles(fullPath);
    }
    return [fullPath];
  });
}

describe("no answer-key field in LEARNER-facing web client source", () => {
  it("correctness is consumed only by admin management or the two owned post-answer views", () => {
    const srcDir = join(__dirname, "..", "..", "src");
    const offenders = listFiles(srcDir)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => !file.includes(ADMIN_ONLY_PATH_SEGMENT))
      .filter((file) => !POST_ANSWER_VIEWS.some(view => file.endsWith(view)))
      .filter((file) => /is_correct|isCorrect/i.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the Admin Console IS the only place isCorrect appears, confirming the boundary is intentional and narrow", () => {
    const srcDir = join(__dirname, "..", "..", "src");
    const adminFilesReferencingIt = listFiles(srcDir)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => file.includes(ADMIN_ONLY_PATH_SEGMENT))
      .filter((file) => /isCorrect/.test(readFileSync(file, "utf8")));
    // Exactly the question-detail admin page manages the answer key —
    // not the whole admin surface indiscriminately.
    expect(adminFilesReferencingIt.map((f) => f.split("/").pop())).toEqual(["page.tsx"]);
  });

  it("QuestionForAttempt still has no answer key while post-answer feedback may contain correctness", () => {
    const quizTypes = join(__dirname, "..", "..", "..", "shared", "src", "types", "quiz.ts");
    const content = readFileSync(quizTypes, "utf8");
    // The file legitimately documents, in prose, why is_correct is
    // excluded — so this checks for no *field declaration* of it, not an
    // absence of the word entirely.
    expect(content).not.toMatch(/\bis_correct\s*[:?]/);
    const questionForAttemptContract = content.split("export interface QuestionForAttempt")[1]?.split("export interface QuizAttempt")[0] ?? "";
    expect(questionForAttemptContract).not.toMatch(/\b(isCorrect|answerReview|rubric|correctOptionIds|correctMatches|correctOrder|explanation)\s*[:?]/);
    expect(content).toMatch(/export interface SubmitAnswerAck[\s\S]*isCorrect:\s*boolean \| null/);
  });

  /**
   * PHASE 12F-BE extension: the same never-select-it-at-all discipline
   * for the 3 new answer-key-bearing identifiers introduced by the
   * match/order/fill question types (Phase 12D-R schema,
   * Phase 12F-BE contract review §H). No learner-facing Web UI for these
   * types exists yet as of this phase (explicitly out of scope — see the
   * implementation report), so this currently passes vacuously; it is
   * added now so a future implementation phase cannot introduce a leak
   * without this test catching it on the very first offending file.
   */
  it("web/src contains no reference to question_accepted_answers/correct_order_index/questions.explanation (learner-facing, excluding the Admin Console)", () => {
    const srcDir = join(__dirname, "..", "..", "src");
    const offenders = listFiles(srcDir)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => !file.includes(ADMIN_ONLY_PATH_SEGMENT))
      .filter((file) => /question_accepted_answers|correct_order_index|correctOrderIndex/i.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the shared QuestionForAttempt contract's matchItems/orderItems have no correctness/order-index field", () => {
    const quizTypes = join(__dirname, "..", "..", "..", "shared", "src", "types", "quiz.ts");
    const content = readFileSync(quizTypes, "utf8");
    // Same convention as the is_correct check above: prose mentions
    // explaining the omission are fine, a *field declaration* is not.
    expect(content).not.toMatch(/\bcorrect_order_index\s*[:?]/);
    expect(content).not.toMatch(/\bcorrectOrderIndex\s*[:?]/);
  });
});
