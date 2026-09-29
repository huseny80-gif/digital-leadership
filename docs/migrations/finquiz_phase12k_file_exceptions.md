# Phase 12K — File Exception Closure (16 records)

Read-only classification of the 16 `SOURCE_PRESENT_TARGET_BYTES_UNAVAILABLE` file references
carried forward from Phase 12I/12J. No file was uploaded, moved, deleted, or renamed. No URL or
storage path was invented. This document only classifies; it performs no migration.

## Environment finding (relevant to classification)

The backend does have a storage abstraction (`backend/src/files/storageProviderFactory.ts`) that
falls back to a local-filesystem provider (`LOCAL_STORAGE_DIR`, default `.local-storage/`) when
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are unset (they are unset in this environment). A
`.local-storage/subjects/` directory already exists, but it contains only one unrelated pre-existing
smoke-test file under a non-Finquiz subject ID — **zero Finquiz binary content has been placed
there**, and no upload is authorized this phase regardless of the provider's existence. This is why
the assigned status below is `REQUIRES_FUTURE_BINARY_MIGRATION` rather than
`BLOCKED_NO_STORAGE_BACKEND`: a mechanism to migrate the bytes exists, but performing that upload is
out of Phase 12K's authorized scope (§4.2 prohibits Storage upload) and must happen in a later,
explicitly authorized phase.

## The 16 files

| # | Subject | Lecture | Type | Source path | Source bytes | Target `files` row | Assigned status |
|---|---|---|---|---|---|---|---|
| 1 | ai-data | الأسبوع الأول | pdf | `files/ai-data/Ai-week1-week2.pdf` | 1,339,832 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 2 | ai-data | الأسبوع الثاني (same source file, shared across both weeks) | pdf | `files/ai-data/Ai-week1-week2.pdf` | 1,339,832 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 3 | cybersecurity-governance | مقدمة في الأمن السيبراني | pdf | `files/cybersecurity-governance/Cybersecurity1.pdf` | 342,489 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 4 | cybersecurity-governance | إطار NIST CSF 2.0 | pdf | `files/cybersecurity-governance/Cybersecurity3.pdf` | 738,427 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 5 | cybersecurity-governance | إطار NIST CSF 2.0 | pptx | `files/cybersecurity-governance/Cybersecurity3.pptx` | 1,332,509 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 6 | cybersecurity-governance | معيار ISO 27014/27001 | pdf | `files/cybersecurity-governance/Cybersecurity4.pdf` | 698,369 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 7 | innovation-project-management | الابتكار وإدارة المشاريع الرقمية | pdf | `files/innovation-project-management/Innovation1.pdf` | 11,624,010 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 8 | innovation-project-management | نظريات ونماذج الابتكار الحديثة | pdf | `files/innovation-project-management/Innovation2.pdf` | 327,780 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 9 | innovation-project-management | الابتكار في البيئة الرقمية | pdf | `files/innovation-project-management/Innovation4.pdf` | 611,033 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 10 | legal-regulatory | التحول الإلكتروني | pdf | `files/legal-regulatory/Legal1.pdf` | 2,309,929 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 11 | legal-regulatory | الثقافة القانونية والتنظيمية | pdf | `files/legal-regulatory/Legal2.pdf` | 4,080,306 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 12 | legal-regulatory | المعاملات والوثائق والتوقيع الإلكتروني | pdf | `files/legal-regulatory/Legal3.pdf` | 10,153,886 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 13 | legal-regulatory | حماية البيانات والخصوصية | pdf | `files/legal-regulatory/Legal4.pdf` | 1,082,556 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 14 | risk-management | الفصل الأول | pdf | `files/risk-management/RiskManagement1.pdf` | 369,999 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 15 | risk-management | الفصل الثاني | pdf | `files/risk-management/RiskManagement2.pdf` | 241,846 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |
| 16 | risk-management | الفصل الثالث | pdf | `files/risk-management/RiskManagement3.pdf` | 226,467 (present) | none | REQUIRES_FUTURE_BINARY_MIGRATION |

Evidence: each source path was verified to exist on disk in the pinned Finquiz clone
(`b737ce31883bf86b3ab461b0238eb496d6e117b3`) with a non-zero byte size (read via `os.path.getsize`,
read-only). Each was independently re-extracted from `data/subjects/*.js` this phase, not
re-trusted from Phase 12I's report. `select count(*) from files` on the target DB = 0, confirmed
unchanged since Phase 12I.

## Status tally

| Status | Count |
|---|---|
| CLOSED_METADATA_ONLY | 0 |
| BLOCKED_NO_STORAGE_BACKEND | 0 |
| MISSING_SOURCE_BYTES | 0 |
| MISSING_TARGET_METADATA | 0 |
| REQUIRES_FUTURE_BINARY_MIGRATION | 16 |

## Future action

A later, explicitly authorized phase should: (a) decide the target storage backend (local-dev
provider vs. a real Supabase Storage project), (b) upload each of the 16 files, (c) insert one
`files` row per upload with correct `lecture_id`/`subject_id`, `storage_path`, and byte size, and
(d) re-run the file-count reconciliation to confirm 16/16 closed. None of this was performed in
Phase 12K.
