# Strict exam source grounding and review analysis

Version four supersedes the summary-input fallbacks described in the earlier
academic-summary document. Generation now reads the original files attached
to every selected published lecture. Catalog HTML, edited descriptions,
independent summaries, old questions and answer keys are never substitute
sources. Missing, damaged or ambiguously shared files stop generation with a
specific error and leave previous archives untouched.

## Extraction and verification

- Original file bytes are checked against their SHA-256 and size. A bundled
  PDF transcription is accepted only when both file and transcription hashes
  match. Uploaded PDFs are parsed with the existing local OCR fallback.
- `backend/scripts/extractExamSources.ts` regenerates the bundled extraction
  cache from the original PDFs without AI or catalog narrative inputs.
  Run `npx tsx scripts/extractExamSources.ts` from `backend`.
- Explicit boundaries scope combined files to the selected lecture, even
  when the file is attached to only one lecture. Ambiguous shared files fail.
- Scientific paragraphs retain their actual words, conditions, numbers and
  negation. Assessment appendices, controls and administrative sections are
  excluded before summarization. Deduplication uses exact normalized text.
- Summaries select complete source sentences. Questions use bounded cloze,
  literal-quotation true/false, matching and numbered-order templates. Each
  answer and quotation is independently validated against a source paragraph.
- Every reference records the original file identity/hash, paragraph number
  and line range **in the extracted text**, rather than invented PDF page
  coordinates. Questions retain these references in their private rubric.

If the existing AI provider is configured, it receives the requested strict
Arabic system instruction and can select only prevalidated candidate IDs.
It cannot introduce prose, answers, claims or outside concepts. Invalid
responses and provider failures use the deterministic extractive generator.
There is no new AI account, provider configuration or external service.

## Learner and instructor analysis

The owning learner's finalized attempt includes `knowledgeGaps`, grouping
incorrect answers by exact source paragraphs. Unanswered questions are
reported separately and never asserted to demonstrate a knowledge deficit.
Correct answers are excluded; legacy questions without proved references
receive no invented citations. Challenge attempts expose no gap report or
answer quotations before final grading. The interface provides expandable
revision excerpts and links back to the original lectures.

Instructor guides are archived in a separate `exam_instructor_guides` table,
created in the same transaction as the new group. Browser roles have no RLS
policy and no direct access. Only the admin-authorized endpoint
`GET /api/v1/admin/subjects/:subjectId/exam-material/:groupId/instructor-guide`
returns the guide; learner-facing summaries and attempts never embed it.
Discussion questions quote selected source passages. Suggested clarification
priorities are explicitly labeled as expected, not measured learner failures.

## Archive compatibility

Existing summaries, quiz keys, attempts and scores remain immutable. Startup
publishes idempotent version-four revisions for visible older selections in
the existing background refresh. Source failures retain the old revision and
are recorded rather than blocking HTTP startup. The main group list remains
deduplicated by lecture selection; earlier revisions remain accessible.

The extraction suite checks all 23 physical source PDFs across the five
subjects. Unit and interface checks cover altered negation/numbers, invented
quotes, excluded appendices, AI response restrictions, precise citations,
unanswered questions, guide loading and authorization failures. Integration
checks use actual uploaded bytes and exercise admin/guest ownership, RLS,
challenge answer secrecy, file changes, real catalog sources and archives.
