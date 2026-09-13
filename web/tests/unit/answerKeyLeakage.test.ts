import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PHASE 09B "Answer-Key Leakage Test" (mandatory). `question_options.is_correct`
 * must never reach the browser — not in a type, not in a component, not in
 * a fixture that could accidentally ship. This statically scans every
 * source file under `web/src` for `is_correct`/`isCorrect` in any casing.
 *
 * The equivalent runtime check — that an actual JSON response body never
 * contains the field — lives in `QuizAttemptRunner.test.tsx` (renders
 * mocked question data and asserts the field is absent from the DOM) and,
 * decisively, in the backend's own `assessments.test.ts` ("11. is_correct
 * never appears in learner question responses"), which inspects the real
 * serialized API response rather than a TypeScript type. A source scan
 * alone would not catch a bug where the type omits the field but the
 * server accidentally serializes it anyway — that is why the backend test
 * exists and is the authoritative check, not this one.
 */
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

describe("no answer-key field in web client source", () => {
  it("web/src contains no reference to is_correct/isCorrect", () => {
    const srcDir = join(__dirname, "..", "..", "src");
    const offenders = listFiles(srcDir)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => /is_correct|isCorrect/i.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
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
