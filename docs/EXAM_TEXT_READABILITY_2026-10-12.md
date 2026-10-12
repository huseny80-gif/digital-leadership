# Readable, source-bound exam content

The AI lecture-two screenshot showed two separate failures: low-quality PDF
OCR was treated as readable evidence, and false true/false items replaced an
arbitrary source word with another word. The latter made ungrammatical claims
even when every individual token came from the file.

The corrected transcription of AI lectures 1–4 uses original `/ActualText`
characters, original font widths and page transforms. It does not use a model,
catalog prose, authored HTML summaries or question banks. Native characters
restore the missing Arabic dots and original vocalization. Screenshot labels
across a gutter are separated from the adjacent Arabic prose. The original
PDF bytes remain unchanged. SHA-256 is checked independently for the PDF and
its transcription. One heading ligature in lecture 2, page 1 was checked
against the rendered original and corrected explicitly in the rebuild script.

Reproduction: install `pypdf==6.10.0`, then run
`python backend/scripts/rebuildNativeExamSources.py`. The four canonical file
identities are explicit. The extractor rejects unsupported TJ streams instead
of silently claiming to transcribe them. In particular, it does not replace
lectures 5 and 6's existing OCR with their broken native character maps. Other
original file transcriptions are retained and pass the same paragraph and
question quality gates. The general cache builder preserves native entries.

Provenance and readability are independent. Bare domains, navigation arrows,
unreadable font maps, detached letters, welded words, repeated Latin OCR noise,
UI tables and incomplete assertions are excluded from question candidates.
Uncached PDF OCR needs at least 85 confidence; unclear text is not repaired by
a language model. Confidence and these gates do not constitute a universal
proof of natural-language correctness, so unreadable new files must be
re-extracted or reviewed from the original, never guessed.

Questions use complete source sentences and whole noun tokens. True/false
assertions keep their original wording. False items compare two explicit
definitions from the same file; they never swap words in a scientific sentence.
Both definitions are retained as evidence. An optional model may only order
known candidate IDs. Exact excerpts, hashes and original extraction line
references are verified independently and shown in feedback, without putting
file metadata in the question stem. Repeated source sentences are deduplicated.

Summary version 5 automatically publishes a new review for every visible
older lecture selection, including already-grounded version 4. The main list
keeps one current entry per selection. Old summaries, question keys, attempts
and scores remain immutable. The stable request ID and current-version check
make startup refresh idempotent. A source failure preserves the archive and
is reported as an issue rather than inserting substitute content.

Regression checks cover the actual lecture-two PDF/transcription and its
generated questions, all 23 file/text hash pairs, five question formats,
negation/numbers/vowels, malformed input, external model output rejection and
version-four revision publication with saved attempts preserved.
