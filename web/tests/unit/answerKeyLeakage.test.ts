import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PHASE 09B "Answer-Key Leakage Test" (mandatory), extended in PHASE 09C.
 * `question_options.is_correct` must never reach the LEARNER-facing
 * client — not in a type, not in a component, not in a fixture that
 * could accidentally ship. This statically scans every learner-facing
 * source file under `web/src` for `is_correct`/`isCorrect` in any casing.
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
  it("web/src (excluding the admin-only Admin Console) contains no reference to is_correct/isCorrect", () => {
    const srcDir = join(__dirname, "..", "..", "src");
    const offenders = listFiles(srcDir)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => !file.includes(ADMIN_ONLY_PATH_SEGMENT))
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

  it("the shared QuestionForAttempt/QuizAttemptResult contracts have no correctness field", () => {
    const quizTypes = join(__dirname, "..", "..", "..", "shared", "src", "types", "quiz.ts");
    const content = readFileSync(quizTypes, "utf8");
    // The file legitimately documents, in prose, why is_correct is
    // excluded — so this checks for no *field declaration* of it, not an
    // absence of the word entirely.
    expect(content).not.toMatch(/\bis_correct\s*[:?]/);
    expect(content).not.toMatch(/\bisCorrect\s*[:?]/);
  });
});
