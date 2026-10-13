# Source-proven analytical exam assessments

New exam-material generation uses `source-case-assessment-v1`. It never falls
back to cloze, definition matching, quote-memory true/false, or single-word
options. Ordinary course quizzes and historical attempts keep their original
keys and formats.

## Source and decision proof

`analyticalCases.json` contains reviewed professional decisions bound to the
SHA-256 of the original lecture PDF. The catalog covers the 23 verified
physical source files across the five subjects. Every scenario and every
option has a source evidence requirement. Evidence resolves to a complete
sentence or paragraph, retaining original conditions, negation, numbers and
Arabic vowels, with the file, paragraph and extraction-line coordinates.
Missing evidence or changed bytes invalidate a case; filenames confer no
trust. Search needles locate evidence and are never presented as quotations.

A local rule compiler also assesses execution plans for self-contained,
mandatory prerequisite rules in newly uploaded sources. It rejects qualified,
optional, negated or ambiguous rules. Concurrency is not marked wrong when a
source imposes a prerequisite without specifying an order. It does not infer
facts from externally authored summaries, old question keys or answer
appendices. Sources without a provable assessment fail closed before publishing.

Each option carries its own suitability rationale and source proof. A final
server guard compares the entire generated question, key and analysis against
an approved source-bound assessment. A valid quotation alone cannot authorize
an invented correct answer, an unsupported distractor or a rewritten rubric.
Deterministic option rotation varies the answer location without losing the
mapping between an option and its proof.

## Optional model integration

No model credential is required for the local source-proven case engine.
When `CONTENT_AI_API_KEY` (or an existing supported alias) is configured, the
server sends the exact expert assessment instruction requested for realistic
leadership decisions, alongside the strict source-only instruction. The model
may prioritize approved assessment program IDs to improve coverage; it cannot
change the questions, decisions, answer polarity or explanations. Unknown IDs,
extra fields, duplicate IDs, transport failures or rewritten claims fall back
to the locally verified cases. The integration does not claim that a second
model's opinion proves a decision. Secrets stay in server configuration.

## Learner feedback and privacy

The knowledge-gap report resolves the submitted option ID through the actual
question options, independently of display order. For an observed wrong
answer it records the scenario, chosen decision, violated criterion, precise
reason, correct decision and source passages. Grouping uses lecture, criterion
and analytical skill. Unanswered questions are counted separately and never
become diagnosed decision errors. Legacy evidence retains its compatible
paragraph-based report without inventing analytical metadata.

Analytical rubrics and correct keys never enter an ungraded learner question
payload. Reports are returned only to the attempt owner after final grading;
challenge mode continues withholding corrections until completion. The
instructor debrief remains on the authenticated admin route.

## Existing archives

The version-six startup refresh publishes one latest analytical revision per
existing lecture selection, including version-five reviews. Stable request IDs
make retries idempotent. Past groups, answer keys, scores and attempts remain
immutable and accessible through history. Incomplete sources preserve their
previous archive rather than publishing a guessed assessment.

Validation includes real original PDF and transcript hashes, every reviewed
case's evidence, tampered keys/rationales, ambiguous rules, wrong option ID
mapping, ownership/RBAC and challenge privacy, version-five refresh idempotency,
and the actual UI interaction. CI runs database integration on isolated
PostgreSQL 16 and builds the production frontend with its security smoke check.
