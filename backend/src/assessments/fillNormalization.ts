/**
 * Deterministic normalization for `fill`-type answer matching (Phase
 * 12F-BE contract review §E). Shared by grading and by tests so the two
 * can never drift.
 *
 * Steps, in order:
 * 1. Trim leading/trailing whitespace.
 * 2. Collapse any run of internal whitespace to a single space.
 * 3. Unicode-aware case-fold (a no-op for Arabic script, which has no
 *    case; only affects Latin-script text).
 *
 * Deliberately does NOT strip Arabic diacritics (tashkeel) or any other
 * combining marks — the approved contract requires diacritic differences
 * to remain meaningful. A question wanting to accept both a diacritic and
 * non-diacritic form must store both as separate
 * `question_accepted_answers` rows; this function must never be extended
 * to fold that distinction away globally.
 */
export function normalizeFillAnswer(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** True if `learnerAnswer` matches any of `acceptedAnswers` after
 * normalization. Pure function — no I/O, safe to unit test directly and
 * to reuse from a repository method that also enforces the "never return
 * the raw accepted-answer text" rule at the call site. */
export function fillAnswerMatches(learnerAnswer: string, acceptedAnswers: string[]): boolean {
  const normalizedLearner = normalizeFillAnswer(learnerAnswer);
  return acceptedAnswers.some((accepted) => normalizeFillAnswer(accepted) === normalizedLearner);
}
