# Academic exam summaries — 2026-10-09

The exam-material summary now organizes each selected lecture into its source topics, with a lecture index, learning objectives where supplied, a concept glossary, and review points balanced across the topics. The reading layout retains the platform's dark glass design and links each section to its original lecture.

Generation includes every readable published lecture body and summary, rather than allowing a brief catalog summary to hide the full lecture text. Approved exact-PDF AI passages supplement the available text; they do not stand in for a complete PDF transcription. Sources from unselected lectures and unpublished items are excluded. Broken fragments are rejected independently, and insufficient sources are rejected without inventing content.

Long documents are no longer sampled into 24 partitions. Every distinct paragraph and source heading contributes to the organized summary. Condensation inside long paragraphs retains definitions, examples, conditions, negation, quantities, legal references and sequences. When a paragraph is condensed, the original details are saved with its topic and remain available under **تفاصيل المحور وتطبيقاته**. Tables preserve cell boundaries. Factual wording comes from the published material; no external model or additional subject facts are introduced.

Version-two summaries use optional `topics`, `objectives`, `concepts`, and topic `details` fields in the existing JSON snapshot. Earlier snapshots remain compatible and immutable. On deployment, `refreshAcademicSummaries` publishes an updated group for each distinct visible legacy selection, using stable request IDs and the existing generation transaction. It retains the old summaries, quizzes, answer keys and attempts. Incomplete/changed sources leave the original group intact and are reported by group ID. Repeat deployments do not create duplicate reviews.

An admin can also use **إنشاء مراجعة محدّثة** for the current lecture selection. It creates a separate archive using the latest published sources. Visitors can read published reviews and never receive generation controls.

Verification covers middle/end-topic completeness, duplicated source paragraphs, conditions/numbers, headings/tables, full lecture bodies behind brief summaries, selected-source boundaries, archive preservation, repeat publication, guest grading, admin refresh, accessible navigation, type checks, and the existing five-course exam-material suites.
