The Arabic review covers 100 unique questions in the AI subject: the 29 original Finquiz questions and 71 questions from six uploaded PDFs. The subject has seven current quizzes, including its 100-question aggregate. Prompts, choices, accepted fill answers, matching pairs, model essay/scenario answers, and feedback are included.

The uploaded PDFs render readable Arabic, but their extracted text contains broken font mappings, disconnected letters, reversed word order, and control characters. The affected questions have been rewritten from visually inspected source pages. The supplied “الحلول والتعليل” document was used to check the original quiz's answers. Unsupported additions were removed from model answers, including the extra two-factor-authentication instruction in the unfamiliar-session scenario. Every reviewed question records readable source text, the original PDF filename, and page references in its feedback. Original PDF bytes and the original Finquiz catalog remain intact.

| Source question set | Reviewed questions |
| --- | ---: |
| Original Finquiz AI quiz | 29 |
| Lecture 4.pdf | 12 |
| مقرر الذكاء الاصطناعي1.pdf | 12 |
| مقرر الذكاء الاصطناعي2.pdf | 12 |
| مقرر الذكاء الاصطناعي3.pdf | 11 |
| مقرر الذكاء الاصطناعي4.pdf | 12 |
| مقرر الذكاء الاصطناعي1- 4 حلول.pdf | 12 |

`backend/content/ai-assessment-review-2026-10-06.json` is server-only answer material. A deployment correction checks source-file checksums and fingerprints of the original questions and answer rows before creating new question IDs and quiz editions in one transaction. Old quiz editions, prompts, grading keys, completed attempts, and unfinished attempts are retained. The import tracking panel follows the new lecture quiz editions. A transactional audit marker makes repeat starts idempotent. Questions added later and other subjects are preserved.

Exact SHA-256 matches select the reviewed question sets when these six PDFs are processed again. This avoids extracting the damaged text or regenerating their reviewed answers. Other documents use an encoding-quality check before generation, with OCR attempted for broken font text. A clearer OCR result can replace longer damaged text; unreadable results fail with an Arabic explanation while retaining the original file. Encoding detection is not semantic or factual validation of every future document.

Validation: backend typecheck, production build, and lint on changed TypeScript files passed. The complete isolated backend suite passed 422 tests. A separate local rehearsal of the inspected 100-question snapshot verified seven current quiz editions, all 100 answer keys and source feedback, unchanged old question rows and completed/unfinished attempts, current import tracking links, repeat-run idempotence, subsequent Finquiz synchronization, and checksum selection for all six original PDFs. The existing real-production-dataset test is excluded from the fresh-database suite as in CI. No learner interface changes were made.
