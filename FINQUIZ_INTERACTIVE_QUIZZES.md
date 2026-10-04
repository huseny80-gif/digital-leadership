# Finquiz interactive questions

Reference: `huseny80-gif/Finquiz@b737ce31883bf86b3ab461b0238eb496d6e117b3`, specifically `assets/js/components/quiz-view.js`, `assets/js/core/quiz.js`, the quiz CSS rules and Arabic quiz strings.

The approved Digital Leadership application shell is retained. The question card follows Finquiz's one-question layout, lettered choices, difficulty/lecture filters, gold progress bar, check action, correct/wrong colors, match selectors, ordering controls, explanations, result badges and retry/clear controls. All 187 source questions receive their original difficulty, lecture and essay/scenario labels through a server-only metadata adapter. Existing database content remains authoritative.

A selection remains editable until the learner presses “تحقق من الإجابة”. The existing API validates, grades and records the response before returning its feedback. Blank text and incomplete matching do not unlock answer details. Correct option identifiers, matching pairs and ordering positions are delivered only in the post-answer review DTO; the initial question DTO contains none of them.

Essay/scenario questions use “عرض الإجابة النموذجية” after entering an answer. Their original rubric points and keywords are rendered as an ordered list, followed by the original explanation. They are not automatically marked wrong and are excluded from the automatic correct/incorrect percentage, as in Finquiz. No generated answers or heuristic essay grading are added.

`GET /api/v1/attempts/:attemptId/feedback` restores only recorded answers belonging to the requesting registered learner or guest. It also checks quiz visibility and sends `Cache-Control: private, no-store`. Unanswered, deleted or foreign questions cannot be requested through this endpoint. Existing attempts, manual grading and progress are preserved. Retry/clear finishes the recorded attempt and starts a new one through the existing endpoints.

Complete draft responses are saved before finalization; a failed save prevents finalization. Result review preserves the selected lecture/difficulty filters and computes the Finquiz count-based display from the backend's saved correctness flags. Existing stored assessment scores remain computed by the backend.

Validation covers all six Finquiz types, blank/incomplete submissions, failure/retry, refresh restoration, guest prefixes, cross-owner access, timer expiry, filter-aware results and all 187 presentation metadata records. Browser checks used seven real source examples (including both an essay and a scenario) at 1280px and 375px, with API response fixtures and the real application shell; there were no JavaScript errors or horizontal overflow. The temporary local browser fixture was removed. New real-Postgres HTTP integration tests run in the repository's CI test database.
