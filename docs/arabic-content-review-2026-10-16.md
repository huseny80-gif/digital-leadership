# Arabic curriculum reading review

The review covers the 25 bundled lecture PDFs across all five subjects and the
separately uploaded sixth cyber-governance lecture. Original PDF bytes and
download identities are unchanged.

`shared/src/arabicProofreading.ts` repairs known PDF spelling artifacts such as
`األول` → `الأول` and `األمن` → `الأمن`. It uses explicit lexical/context rules;
it does not complete unknown words or invent facts. Academic API responses,
summary views, source citations, question wording, reports, printouts and
narration share the display correction. URLs, attributes, code, identities,
stored answers, participant messages and private feedback are excluded.

Five text-heavy risk/innovation files required new extraction. The PDF reader
groups actual glyph runs by baseline and spacing, retaining Arabic word joins
and left-to-right numeric groups. The review record binds each transcription to
the original SHA-256. CI reproduces the five readings directly from PDF bytes,
checks all 25 file hashes and preserves the numeric values in the reviewed
Fukushima/Onagawa and water-risk example. Landscape slide-column extraction and
the six previously verified legal readings retain their established readers.

The uploaded cyber-risk lecture receives a source-backed reading and summary
through the library after subject/lecture/file publication checks. Every read
verifies the current uploaded bytes, checksum and lecture ownership. The
startup probe reports paragraph/topic counts without logging file bodies.
It also checks source-proven assessment candidates. The exam generator can
compare three explicit concept/description relations or risk treatments from
one file; it no longer depends only on reviewed cases and BEFORE clauses.
Every correct and incorrect mapping has intact source references and a
replayable grading program. Ambiguous definitions, narrative colons, competing
meanings and cross-file combinations are rejected. Learner gap reports retain
the corresponding paragraph/line links and the actual incorrect option.

Exam summary version 7 and course review version 3 publish new grounded
editions, preserving original questions, answer keys, attempts and archive
snapshots. Old summary bookmarks can read corrected text only from the same
verified file edition; additional or changed sources cannot inherit it.

Rebuild the reviewed artifacts locally:

```sh
npm run build --workspace=shared
npm run build --workspace=backend
node backend/scripts/reviewArabicPdfExtraction.mjs --write
node backend/scripts/buildCatalogStudyContent.mjs
```

The tools do not require a database, external model, OCR service or new
credentials. Production uses the bundled transcripts; private files remain in
the configured storage provider.
