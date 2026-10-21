# Reviewed Innovation assessment bank

Approved curriculum edition: `reviewed-innovation-curriculum-v1` (2026-10-21).
The bank contains 220 questions covering 64 topics from the five original
Innovation and Project Management lecture PDFs. It replaces current generated
Innovation banks; it never updates historical question rows or answer keys.

| Lecture | Questions |
| --- | ---: |
| 1 | 63 |
| 2 | 33 |
| 3 | 38 |
| 4 | 44 |
| 5 | 42 |

| Format | Questions |
| --- | ---: |
| Multiple choice | 64 |
| True/false | 28 |
| Matching | 26 |
| Ordering | 8 |
| Essay | 66 |
| Short scenario | 28 |

Difficulty: 103 easy, 90 medium, 22 hard, 5 very hard. Difficulty and Bloom
labels are editorial classifications, not empirically calibrated item measures.
The previous 41 applied items retain their formats, alternative counts, keys
and difficulty. Their original programs remain replayable for saved archives.

`innovationAssessments.json` is a server-only, reviewed program catalogue.
References and nested assessment references are indices into its deduplicated
`evidence` table. Each entry retains a complete source quotation, original PDF
SHA-256 and extracted-text location. Generation rebinds that quotation to the
actual selected paragraphs and rejects incomplete coverage. No filename-only,
citation-only or model-authored answer-key fallback is permitted. Exact replay
checks wording, options, matching keys, order, rubrics, feedback and levels.

Ordering is used only for a sequence stated by the source. Lectures 2 and 3
therefore have no ordering question. The eight-stage project framework in
lecture 1 and the five-phase lifecycle in lecture 4 remain separate frameworks.
MCQ distractors use other concepts from the same lecture. Written responses
have model criteria and remain subject to self/instructor review, never a
fabricated automatic grade.

The existing source revision is extended only for the Innovation subject.
Refresh publishes new course editions and exam-material revisions once per
selection/revision. Old memberships, attempts, answers, scores and archives
stay immutable. Future editorial editions must retain approved v1 programs for
archive replay rather than deleting or silently rewriting their keys.

Verification: `innovationAssessment.test.ts` reads the actual five PDFs and
checks all 220 programs, levels, 64 topic IDs, tamper rejection, archive replay,
public answer-key exclusion and all 41 previous programs.
`innovationAssessmentPublication.test.ts` exercises real Postgres publication,
all six grading paths, selected-lecture isolation, idempotency and preservation
of historical results and exam revisions.
