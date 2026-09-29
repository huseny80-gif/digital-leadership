import { describe, expect, it } from "vitest";
import { normalizeFillAnswer, fillAnswerMatches } from "../../src/assessments/fillNormalization.js";

/**
 * The 5 approved normalization examples from the Phase 12F-BE-DESIGN
 * final contract review §E — deterministic, shared by grading (via
 * `fillAnswerMatches`, used from `assessmentsRepository.scoreFillAnswer`)
 * and this test, so the two can never drift.
 */
describe("normalizeFillAnswer / fillAnswerMatches", () => {
  it("1. exact match is accepted", () => {
    expect(fillAnswerMatches("ميثاق المشروع", ["ميثاق المشروع"])).toBe(true);
  });

  it("2. leading/trailing whitespace is trimmed and accepted", () => {
    expect(fillAnswerMatches("  ميثاق المشروع  ", ["ميثاق المشروع"])).toBe(true);
  });

  it("3. repeated internal whitespace is collapsed and accepted", () => {
    expect(fillAnswerMatches("ميثاق    المشروع", ["ميثاق المشروع"])).toBe(true);
  });

  it("4. case variation is accepted (case-folded)", () => {
    expect(fillAnswerMatches("project charter", ["Project Charter"])).toBe(true);
  });

  it("5. Arabic diacritics are NOT stripped -- a diacritic-only difference is rejected", () => {
    // Accepted answer has no diacritics; learner input has tashkeel.
    // The two must NOT match -- diacritic differences remain meaningful,
    // per the locked decision. A question wanting to accept both forms
    // must store both as separate question_accepted_answers rows.
    expect(fillAnswerMatches("مِيثَاق", ["ميثاق"])).toBe(false);
  });

  it("matches against any one of several accepted-answer variants", () => {
    expect(fillAnswerMatches("blue", ["red", "blue", "green"])).toBe(true);
  });

  it("rejects a wholly different string", () => {
    expect(fillAnswerMatches("wrong", ["right"])).toBe(false);
  });

  it("normalizeFillAnswer is idempotent", () => {
    const once = normalizeFillAnswer("  A   B  ");
    expect(normalizeFillAnswer(once)).toBe(once);
  });
});
