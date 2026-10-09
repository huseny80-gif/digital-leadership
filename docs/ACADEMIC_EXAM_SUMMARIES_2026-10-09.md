# Academic exam summaries — 2026-10-09

The exam-material summary now organizes each selected lecture into its source topics, with a lecture index, learning objectives where supplied, a concept glossary, and review points balanced across the topics. The reading layout retains the platform's dark glass design and links each section to its original lecture.

Generation includes every readable published lecture body and summary, rather than allowing a brief catalog summary to hide the full lecture text. Approved exact-PDF AI passages supplement the available text; they do not stand in for a complete PDF transcription. Sources from unselected lectures and unpublished items are excluded. Broken fragments are rejected independently, and insufficient sources are rejected without inventing content.

Long documents are no longer sampled into 24 partitions. Every distinct paragraph and source heading contributes to the organized summary. Condensation inside long paragraphs retains definitions, examples, conditions, negation, quantities, legal references and sequences. When a paragraph is condensed, the original details are saved with its topic and remain available under **تفاصيل المحور وتطبيقاته**. Tables preserve cell boundaries. Factual wording comes from the published material; no external model or additional subject facts are introduced.

Version-three summaries use optional `topics`, `objectives`, `concepts`, and topic `details` fields in the existing JSON snapshot. Earlier snapshots remain compatible and immutable. On deployment, `refreshAcademicSummaries` publishes an updated group for each distinct visible version-one or version-two selection, using stable request IDs and the existing generation transaction. It retains the old stored summaries, quizzes, answer keys and attempts. Incomplete/changed sources leave the original group intact and are reported by group ID. Repeat deployments do not create duplicate reviews.

## Scientific content only

The original Finquiz interactive summary documents contain a scientific narrative followed by an embedded self-test, question-count and format controls, model-answer instructions, results and reset buttons. Version two included that appendix as another academic topic. Version three filters each source independently before combining it, preserves HTML heading levels, excludes the entire assessment/answer appendix and resumes at a later sibling or parent scientific heading. Answer-only files and lecture items are excluded by their explicit titles. Source question stems, feedback, explanations and rubrics are never summary inputs; original scientific quotations may still be used as a readable fallback.

Filtering does not remove scientific topics merely because they discuss hypothesis testing, training an AI model, research questions, causes or worked conceptual examples. Learning objectives, concepts, topic details and review points follow the same content rule. The archive detail endpoint projects the stored snapshot through this filter, so bookmarked older groups also stop displaying assessment appendices without replacing their original scientific text with newer lecture content or rewriting stored snapshots. Their quiz identities, grading keys, attempts and scores are unchanged.

Regression checks include all four actual affected HTML assets (AI, cybersecurity, innovation and legal), a scientific section following an assessment appendix, answer-only documents, historical URLs, immutable original keys/scores, and repeat-safe upgrade of both older summary versions.

An admin can also use **إنشاء مراجعة محدّثة** for the current lecture selection. It creates a separate archive using the latest published sources. Visitors can read published reviews and never receive generation controls.

Verification covers middle/end-topic completeness, duplicated source paragraphs, conditions/numbers, headings/tables, full lecture bodies behind brief summaries, selected-source boundaries, archive preservation, repeat publication, guest grading, admin refresh, accessible navigation, type checks, and the existing five-course exam-material suites.
