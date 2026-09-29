# Legacy Content — Migration Status

## File origin

`archive/legacy/quiz digital leadership.html` (847 lines) was the original, pre-platform static prototype committed as `quiz digital leadership.html` at the repository root (commit `a5fcd92`, 2026-06-06 — "Add files via upload"). It predates every phase of the current Digital Leadership platform (backend, web, mobile, database schema) and was never built by, or integrated with, any of that code.

It was removed from the repository root in commit `bc77549` ("chore: remove legacy quiz html", 2026-09-15), which predates this remediation. This file restores its content — unchanged — to `archive/legacy/`, recovered from its original commit (`a5fcd92`), so it is reachable in the working tree by path rather than only recoverable from git history.

## Archive reason

`PHASE3_CURRENT_STATE_REPORT.md` §5 documents this file as the **source for a still-open task**, not dead content:

> "This is the source Phase C asks to extract 7 lectures/questions/options/explanations from — content extraction has not yet been done." ... "**Legacy content migration**: recover `quiz digital leadership.html` ..., parse its 7 lectures/questions/options/explanations, and write a one-off data-seeding script that inserts them as `subjects`/`lectures`/`lecture_items`/`question_banks`/`questions`/`question_options` rows via existing repositories — not new tables."

Since that extraction was never done, and the file was previously removed from the working tree entirely, this remediation restores it to an explicit `archive/legacy/` location — discoverable by anyone picking up that task, without requiring them to know it exists only in git history, and without it cluttering the repository root the way the original top-level placement did.

## Future migration plan

Unchanged from `PHASE3_CURRENT_STATE_REPORT.md`'s own recommendation, restated here for visibility:

1. Parse `archive/legacy/quiz digital leadership.html`'s 7 lectures and their questions/options/explanations.
2. Write a one-off data-seeding script (following the pattern already established by `backend/scripts/finquizImport/`) that inserts this content as rows in the **existing** `subjects`/`lectures`/`lecture_items`/`question_banks`/`questions`/`question_options` tables — no new tables, no schema change.
3. Run the script once against the target environment, then it has no further purpose (same lifecycle as the Finquiz import scripts).
4. This file (`archive/legacy/quiz digital leadership.html`) may be deleted once that extraction is complete and verified — at that point it becomes genuinely dead content, unlike its current status.

**This remediation performs no code change and no data migration itself** — it only preserves the source material and documents the still-open task, per the explicit remediation scope approved for this pass.
