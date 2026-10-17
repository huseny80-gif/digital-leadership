# Source-grounded assessment formats

Course review policy: `file-verified-course-assessments-v4-diverse`.
Exam generation policy: `source-diverse-assessment-v1`.

The five curriculum banks now distinguish multiple choice, true/false,
matching, ordering, essay and short scenario questions. The quiz runner offers
independent format filters without discarding a learner's answers. PDFs and
academic papers use the same classifications.

The server-only program catalog binds every reviewed question and answer model
to an original PDF SHA-256 and complete paragraph/line evidence. The 26 verified
transcripts supply the reviewed banks. Matching uses explicit source relationships;
ordering uses an explicitly numbered sequence or the documented chronology of a
source example. A lecture without a defensible sequence does not receive an
invented ordering question. Model-assisted ranking cannot author or edit keys.

`diverseAssessment.ts` validates canonical replay of prompts, alternatives,
polarity, pair mappings, sequences, written criteria and citations, including
PostgreSQL JSONB serialization. Source citations alone cannot authorize altered
answer data. Fluent reviewed written prompts replace their parent MCQ rather
than repeating the same case in several formats.

Objective answers are checked by the server. Essays and short scenarios expose
a sourced model after the existing answer/submission gate and remain subject to
self/manual review. Challenge submission and expiration preserve the pending
review status of ungraded written answers. Knowledge-gap reports never label
an ungraded written answer as correct or incorrect.

New matching questions use independent opaque IDs on the two sides. The
association stays in private server metadata; submitted IDs are translated to
the existing database foreign keys and restored using the same opaque IDs.
Legacy keys and attempts retain their original behavior.

Startup publishes new course editions and one new exam revision per saved
lecture selection. Previous question membership, keys, answers and scores stay
immutable. Stable IDs make restart/retry idempotent. Original instructor weekly
exam transcriptions are preserved.

Validation covers all 26 transcripts, all six formats across the five source
families, tampered grading programs, answer-key disclosure, matching round trips,
all-five-course publication, revision idempotence, historical snapshots and UI
filter persistence. `course_assessments_source_verified` emits actual format and
reference counts; `diverse_exam_groups_refreshed` reports revision outcomes.
