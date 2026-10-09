# Risk lecture content review — 2026-10-09

The three risk lectures now use **المحاضرة الأولى مخاطر**, **المحاضرة الثانية مخاطر**, and **المحاضرة الثالثة مخاطر**. Legacy Risk1/Risk2/Risk3 records, their associated item/quiz/import labels, and download filenames resolve to these names while retaining their existing IDs, storage keys, and PDF bytes.

The reviewed sources are the three original risk-management PDFs already imported from DigitalLeadership_Lectures. Their identities are pinned in `backend/content/risk-source-review-2026-10-09.json`:

| Lecture | PDF pages | SHA-256 |
| --- | ---: | --- |
| الأولى | 12 | `f567de9bd8df8d0bbd6606bed669499854d539a0da55cfeafb526383f7b8f7ec` |
| الثانية | 13 | `55341ea2a940428c8fc3212ac6b9c57bf991daf1987f9f4c0766e98befba19f2` |
| الثالثة | 11 | `ea9b8f2a66c5a50627529720e4b81788cbdd8bba3b4e62d6053efa6072635af9` |

Three academic summaries and 36 reviewed questions cover the source concepts, with 12 questions per lecture: three multiple-choice, three true/false, two fill, two matching, one ordering, and one scenario with a model answer. Questions retain the source PDF identity, physical page references, source excerpts, correct answers, and explanatory feedback. The first PDF's blank cover counts as physical page 1.

Content corrections distinguish the lecture author's proposed maturity ladder from a published standard, and attribute the financial-law example to the text quoted in lecture three. Scenario answers and question wording were checked for clear Arabic and agreement with the source material.

Publication creates new lecture and combined practice editions. Existing question keys, old quiz memberships, attempts, grades, and archived exam group snapshots are preserved. Complete graded-content fingerprints identify old catalog questions even when deployed UUIDs differ; instructor additions or edits are retained in the combined edition. A private audit records replaced summary bodies. Later instructor summary edits are not overwritten on repeat deployment.

Lecture consolidation skips any source container referenced by an existing exam group, so an old archive remains available even if a duplicate canonical lecture exists. New archives continue to use published source text and current practice questions.

Verification covers exact PDF checksums, reviewed-question digests, Arabic naming and file metadata, all automatic grading formats, scenario feedback for permanent guests, repeat-deployment idempotency, preservation of historical answers/teacher changes, and archive visibility. The existing five-course exam-material and source-review integration suites also run against an isolated database.
