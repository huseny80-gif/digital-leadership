# المادة الامتحانية

Every subject has an **المادة الامتحانية** section at `/subjects/:subjectId/exam-material`. Administrators select published lectures with checkboxes and press **توليد المحتوى الامتحاني**. Each successful generation publishes a new numbered group containing **الملخص الشامل** and **الاختبار التفاعلي المتقدم**. Registered learners and permanent guests can read groups and take the tests; only administrators can generate them.

## Source and archive behavior

- Summaries combine the selected lectures' published study summaries, library content and lecture text. Long source bodies are condensed by retaining original statements across the source, prioritizing definitions and explicit steps. No external model or extra credentials are required. Missing or damaged source text produces an actionable error rather than invented material.
- Source readability is checked per fragment before merging: a damaged legacy PDF extract cannot invalidate an available readable summary. Empty or unreadable summaries fall back to the published lecture body, then approved question excerpts and checksum-verified PDF reviews. If no readable source remains, generation still stops without creating an archive or inventing content.
- Questions are independently copied from the selected lectures' current published course banks, including their authoritative answers, explanations, source excerpts and scoring. If a new lecture has no usable automatic questions, the existing source-grounded generator builds them from its readable text.
- Multiple choice, true/false, fill, matching and ordering questions use the existing server grading system. Open responses requiring manual grading remain in ordinary course quizzes. Selection balances available formats and difficulties and covers every selected lecture, up to 12 questions per lecture and 200 per group.
- The name records the actual lecture numbers: `(1-3)` for a contiguous selection, `(1، 3، 6)` for gaps. A sequence and date distinguish repeated selections.
- A new request always creates a new archive, even for the same selection. Retrying the same request ID returns the already saved group; changing its selection returns a conflict. Advisory locks and one transaction prevent partial or duplicate archives.
- Summary text, lecture labels, questions and answer keys are snapshots. Course imports and refresh jobs select only quizzes with `purpose='course'`, preserving exam quizzes and attempts. Archive creation never changes source answer keys or prior scores.
- Groups follow their subject and selected lectures' publication visibility. Unpublishing, removing or moving a selected lecture hides the group and its direct quiz from learners, search and activities while retaining the administrator's archive. Browser database roles have no direct access to the archive table.

## API

All routes use existing authenticated user or signed guest sessions, `private, no-store` responses and UUID validation. Never accept a client-supplied role or attempt owner.

| Method | Route under `/api/v1` | Purpose |
| --- | --- | --- |
| GET | `/subjects/:subjectId/exam-material?page=1&limit=20` | Subject, published lectures, generation capability, paginated groups |
| GET | `/subjects/:subjectId/exam-material/:groupId` | Summary snapshot, quiz metadata and source lecture labels |
| GET | `/subjects/:subjectId/exam-material/:groupId/attempts/:attemptId` | Own attempt, public questions, saved answers, earned feedback and submitted result |
| POST | `/admin/subjects/:subjectId/exam-material` | Admin-only generation; body `{lectureIds: UUID[], requestId: UUID}` |

Attempt creation, answer submission and finalization use existing `/quizzes/:quizId/attempts` and `/attempts/:attemptId/*` APIs. Initial payloads contain no answer keys. A result-loading failure can be retried without losing the finalized attempt. Correct answers and explanations are released only after a validated owned answer.

Migration `00000000000022_exam_material.sql` is applied during backend startup before content refresh workers. It adds the quiz purpose and durable group table; no existing content or scores are deleted. The frontend uses a whitelisted GET proxy and the existing admin POST proxy. URL parameters preserve the selected group, inner tab and attempt, including after reload or browser back navigation.

## Validation

Integration tests exercise admin permission, permanent guest access, selected-source isolation, all five automatic formats, initial answer-key exclusion, owner isolation, archival immutability, idempotent concurrent retries, failed generation rollback, publication visibility, course import isolation and database role denial. Frontend tests exercise selection, clear, retry keys, separate archives, keyboard navigation, aborted requests, inline results and restored attempts. The existing quiz runner keeps its navigation behavior unless explicit inline callbacks are supplied.
