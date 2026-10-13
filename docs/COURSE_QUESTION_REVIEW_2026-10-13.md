# Source review of course assessments

The ordinary course quiz still used the upload generator's lexical cloze
fallback. It removed an arbitrary significant word and selected unrelated
single words as distractors. The optional model validator checked the correct
answer's substring but did not prove the wrong alternatives or feedback.

Upload generation now uses complete source concepts, explicit execution rules
and sourced analysis. Definitions are paired with their complete meanings;
conflicting definitions do not get an automatic key. Every alternative and
reference comes from the supplied text. Unreadable OCR does not receive a
fabricated answer. Open analysis is explicitly self/manually reviewed. Models
can order approved question IDs only; they cannot change a stem, option, key,
condition or rationale. The validator checks the entire canonical program.

For existing managed course quizzes in the five catalog subjects, startup
publishes new editions from file-verified analytical cases and provable rules.
It reads real source bytes through LectureSourceFiles and checks lecture
publication, ownership, source links and concurrency before committing. Every
case contains references for its context, correct choice, rejected choices and
rationales. Sources without a reliable assessment are reported and do not get
invented replacement questions. Trainer-authored independent quizzes and exam
material archives are outside this course edition migration.

Historical questions, option IDs, memberships, grades and attempts remain
unchanged. Only the old course edition's supersession pointer changes. Repeated
startup is idempotent; late legacy generated membership can be repaired without
rewriting its snapshot. Replacing a lecture source retires its earlier reviewed
cases from the new course edition, preserving them in earlier editions.

Starting from an old quiz link follows a visible successor in the same course
and lecture. The browser routes to the quiz ID returned by the created attempt.
Saved attempts retain their original questions and show a link to the reviewed
edition. This avoids applying new answer keys to old selections. Public question
delivery still excludes grading metadata, and hidden successors remain hidden.

Verification includes the pictured malformed cloze, invented distractors and
feedback, key polarity tampering, model injection, preserved legal conditions,
isolated OCR letters, user/guest supersession, six real legal PDFs, PostgreSQL
history preservation, source availability, replay idempotency, late legacy
generation, safe initial payloads, and browser navigation. Production logs report
current public quiz IDs, counts and weak-format/reference counts, never keys or
learner data.
