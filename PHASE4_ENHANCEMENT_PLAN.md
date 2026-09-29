# Phase 4 — Product Enhancement Plan

Baseline: commit `12549d9`, branch `claude/educational-platform-phase-1-29felh`. Analysis only — no code changed. Based on a read-only code survey (file:line citations below); no live browser was used.

**Constraints respected in this plan:** nothing proposed touches authentication, OAuth, Supabase core schema, or the quiz grading engine. Every item is additive UI/UX or, where noted, an additive (non-breaking) schema extension.

## 1. Student UX improvements

| # | Gap found | Evidence | Proposed enhancement |
|---|---|---|---|
| 1.1 | No lecture completion tracking anywhere | Lecture page has position nav ("Lecture N of M") but no mark-as-done (`subjects/[subjectId]/lectures/[lectureId]/page.tsx`) | Add a "Mark as complete" action + visible checkmark. This is the `lecture_progress` table already identified as genuinely missing in `PHASE3_CURRENT_STATE_REPORT.md` §2 — additive table, no existing schema touched. |
| 1.2 | No subject-level or dashboard-level progress indicator | `subjects/[subjectId]/page.tsx` shows static counts only; `dashboard/page.tsx` has no stats (deliberately, per its own comment) | Once 1.1 exists, show "X of Y lectures complete" per subject and on the dashboard — real data, not invented stats, consistent with the dashboard's existing no-fabrication rule. |
| 1.3 | No "continue where you left off" | Dashboard/subjects list are static lists | Surface the most recently viewed/incomplete lecture as a "Continue" card on the dashboard, derived from 1.1's progress table. |
| 1.4 | Quiz result page shows only aggregate score, no per-question review | `quizzes/[quizId]/result/[attemptId]/page.tsx` L11-14, deliberate prior decision | **Not recommended without separate authorization** — this is a security-reviewed boundary (never leak answer key), already flagged in `FINAL_PLATFORM_READINESS_REPORT.md` §4. Listed here for completeness only; do not implement under this plan. |
| 1.5 | Profile page is read-only, no activity summary | `profile/page.tsx` L32-47, bare `<dl>` | Add a simple "your activity" section (quizzes taken, average score) once safe aggregate queries exist — low priority, cosmetic. |

## 2. Admin improvements

| # | Gap found | Evidence | Proposed enhancement |
|---|---|---|---|
| 2.1 | No pagination on admin subjects/quizzes/users lists | `adminGet<Subject[]>("subjects")` etc. fetch entire table in one call, no page params | Add pagination (reuse the existing `PaginatedResult<T>` pattern already used elsewhere in the API contract) once list sizes grow — low urgency at current content volume (5 subjects), but a real scale risk. |
| 2.2 | No search/filter in any admin list page | Confirmed absent in subjects/quizzes/users pages | Add a simple client-side text filter (title/email) — cheap, no backend change needed for current data volumes. |
| 2.3 | No bulk actions (e.g. bulk publish/delete) | Every action is per-row | Low priority; current content volume doesn't justify it yet. Defer. |
| 2.4 | No duplicate/clone action for quizzes or subjects | Confirmed absent | Medium value for admin authoring speed — "Clone quiz" would save re-entering questions for similar assessments. |
| 2.5 | Lecture/question ordering is manual `order_index` editing, no drag-and-drop | Lecture page comment confirms server-side `order_index asc` sort, no reorder UI found | Add drag-to-reorder in the admin lecture/question list, writing to the existing `order_index` column — additive UI only, no schema change. |

## 3. Quiz improvements

| # | Gap found | Evidence | Proposed enhancement |
|---|---|---|---|
| 3.1 | `quiz.timeLimitSeconds` is never used in the UI | Confirmed absent from `QuizAttemptRunner.tsx` by full read | If a quiz has a time limit configured in admin, it currently has no effect on the learner experience — silently ignored. Add a visible countdown + client-side warning; auto-submit-on-expiry should call the same `/attempts/:id/submit` endpoint already used for manual submit (no new backend contract). **This is the one item here closest to a "confirmed defect"** (a configured feature with zero effect), so it's ranked as high priority. |
| 3.2 | No question navigator, only linear Prev/Next | `QuizAttemptRunner.tsx` L314-330 | Add a compact "jump to question" strip showing answered/unanswered state — improves usability for longer quizzes, no backend change. |
| 3.3 | Auto-save indicator is a bare "Saving…" text, no success/failure clarity beyond that | `QuizAttemptRunner.tsx` L304-306 | Add a brief "Saved ✓" confirmation state after a successful save — small polish item. |

## 4. Responsive/mobile improvements

| # | Gap found | Evidence | Proposed enhancement |
|---|---|---|---|
| 4.1 | Sidebar/BottomNav switch via CSS breakpoint only (both always render in the DOM) | `globals.css` — sidebar shown ≥1000px, bottom nav shown <1000px; `AppShell.tsx` renders both unconditionally | Functionally fine (no bug), but both navs' data/queries run on every load regardless of viewport — a minor performance nit only, not a visible defect. Low priority. |
| 4.2 | `QuizAttemptRunner.tsx` has no explicit mobile-specific layout — generic inline flex styles only | Confirmed no `@media` rules scoped to the quiz runner | The match-question `<select>` row and order-question row (recently added) should be checked at narrow widths — a real risk given they're brand-new and untested on a real device (this session has no browser/live device access, noted in the prior readiness report). Recommend a manual mobile check before/alongside any further quiz UI work. |
| 4.3 | Admin tables already have a horizontal-scroll wrapper | `globals.css` `.admin-table-wrap { overflow-x: auto }` | No action needed — already handled. |

## 5. Priority order

1. **3.1 — Quiz time limit has no UI effect.** Closest thing to an actual defect (a configured admin feature that silently does nothing for learners). Highest priority.
2. **4.2 — Verify match/order question mobile layout.** Newly added code, unverified on a real device; risk of a broken experience for mobile learners on exactly the feature just shipped.
3. **1.1 + 1.2 — Lecture completion + progress display.** Highest learner-value feature gap; unblocks 1.3 as a natural follow-on. Requires one small additive migration (`lecture_progress`, already scoped in Phase 3 analysis).
4. **2.5 — Drag-to-reorder in admin.** Meaningful authoring-speed improvement, additive UI only.
5. **3.2 + 3.3 — Quiz navigator + save confirmation.** Polish, no backend change, low risk.
6. **2.2 — Admin search/filter.** Cheap, client-side only.
7. **2.4 — Quiz/subject clone.** Medium admin value, moderate implementation cost (needs a clear "what gets copied" spec).
8. **1.5, 2.1, 2.3, 4.1.** Low priority / not urgent at current content and user volume.
9. **1.4 (result-page answer review).** Explicitly not recommended without a separate, explicit authorization — it reopens a deliberate security decision.

## 6. Estimated impact

| Item | Learner/admin value | Implementation risk | Notes |
|---|---|---|---|
| 3.1 Quiz timer | High (fixes a silently broken configured feature) | Low — reuses existing submit endpoint | No schema change |
| 4.2 Mobile check for match/order | High (risk mitigation on just-shipped code) | Very low (verification, minor CSS if needed) | No backend involved |
| 1.1+1.2 Lecture progress | High (core LMS expectation, currently entirely absent) | Medium — one additive table + endpoints + UI | Matches Phase 3's own prior scoping |
| 2.5 Drag-to-reorder | Medium (admin efficiency) | Medium (drag-and-drop library + order_index writes) | No schema change |
| 3.2+3.3 Navigator + save confirm | Medium (usability polish) | Low | No schema change |
| 2.2 Search/filter | Low-medium | Very low | Client-side only |
| 2.4 Clone quiz/subject | Medium (admin speed) | Medium (needs a copy-semantics decision: questions by reference or by copy?) | Needs a product decision before implementation |
| 1.5, 2.1, 2.3, 4.1 | Low | Low-medium | Defer |
| 1.4 Answer review on results | High learner value, but explicitly a security-reviewed exclusion | N/A — not proposed for implementation | Needs separate explicit sign-off, not part of this plan |

**Awaiting your approval before implementing anything.** Please confirm which numbered items to proceed with — I'd suggest starting with 3.1 and 4.2 given they're the lowest-risk, highest-value items (one fixes a silently non-functional feature, the other verifies newly-shipped code), then 1.1/1.2 if you want the larger progress-tracking feature.
