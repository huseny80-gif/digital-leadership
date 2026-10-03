import type { Subject } from "@shared/index";

export const subjectThemeCycle = ["ai", "legal", "cyber", "innovation", "risk"] as const;
export type SubjectTheme = (typeof subjectThemeCycle)[number];

export const subjectIconByTheme: Record<SubjectTheme, string> = {
  ai: "🧠",
  legal: "⚖",
  cyber: "🛡",
  innovation: "💡",
  risk: "⚠",
};

/**
 * Stable title → theme mapping (reference design requirement: don't rely
 * on array index alone, since `Subject` has no `slug`/`code` field and
 * API ordering isn't a guaranteed identity).
 *
 * CONFIRMED BUG (real production data, verified directly against the
 * `subjects` table): an earlier version of this mapping matched the
 * FULL title with exact string equality, using titles typed with
 * hamza (إدارة, الأمن). The real production rows drop the hamza
 * (ادارة, الامن — e.g. "ادارة المخاطر واتخاذ القرار"), so every exact
 * match failed and every card silently fell back to index-cycling —
 * which is exactly how "إدارة المخاطر واتخاذ القرار" ended up rendered
 * as the (wrong) "ai"/blue theme instead of "risk"/red.
 *
 * Fixed by matching a short, theme-unique keyword as a SUBSTRING
 * instead of the whole title by exact equality — each keyword below
 * contains no alef-hamza character at all, so it is immune to that
 * specific hamza-normalization drift (and to extra words a title gains
 * over time, e.g. "واتخاذ القرار"). Falls back to index-cycling only
 * for a title matching none of the five known keywords, so a future/
 * renamed subject still renders instead of breaking.
 */
const subjectThemeKeywords: [RegExp, SubjectTheme][] = [
  [/ذكاء|اصطناعي/, "ai"],
  [/قانون/, "legal"],
  [/سيبراني/, "cyber"],
  [/ابتكار/, "innovation"],
  [/مخاطر/, "risk"],
];

export function themeForSubject(subject: Subject, index: number): SubjectTheme {
  const match = subjectThemeKeywords.find(([pattern]) => pattern.test(subject.title));
  return match ? match[1] : subjectThemeCycle[index % subjectThemeCycle.length];
}
