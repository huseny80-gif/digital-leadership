# Advanced examination review

Each subject's **المادة الامتحانية** has four accessible, URL-addressable tabs:
the comprehensive summary with Arabic narration, the interactive concept map,
the two-mode quiz, and the complete PDF revision package. The cards keep the
platform's dark glass surfaces even when the surrounding shell uses light mode.
The existing right sidebar, permanent guest access, study assistant and separate
question/summary PDF controls remain available.

## Sources and archives

Only administrators can select published lectures and generate a group. Each
new deliberate generation creates an independent summary/question snapshot;
retrying the same request ID is idempotent. The primary archive lists the latest
version of each unordered lecture selection once, with older versions in its
history. Bookmarked old summaries, questions, grades and attempts stay intact.

`shared/src/examReview.ts` supplies the requested deterministic **mock AI**
adapter. It organizes the authorized, study-only academic summary into concept
nodes and speech chapters without calling an LLM. Definitions and explanations
come from the source. Cross-lecture links mean the same explicit term appears in
both lectures; they do not infer causal relationships. Assessment appendices
remain outside the academic summary and narration. Backend detail delivery and
PDF export use the same versioned adapter (`source-mock-v1`); the frontend also
supports legacy detail payloads without the generated artifacts.

## Audio and concept map

The compact player uses the browser's Web Speech API with an available Arabic
voice, preferring a local voice. It supports chapter selection, position, speed,
voice choice, pause, resume and stop. Long passages are divided into short
utterances without discarding their tail. Playback is canceled when the reader
leaves the tab or changes group. Device/browser voice availability is shown
honestly: this adapter does not generate an MP3 or promise background playback
when the operating system suspends the browser. Installing an Arabic system
voice enables devices with no available Arabic voice. A later TTS provider can
replace this adapter without changing the chapter/source contract.

The map is an accessible connected tree with selectable definitions, shared-term
references, lecture filters, text search, branch expansion/collapse and zoom.
The source definitions are rendered as escaped text. Scrolling stays inside the
map; narrow displays stack the map and explanation panel.

## Learning and timed challenge

Learning preserves the existing Finquiz interaction and instant authoritative
feedback. Challenge attempts are separate and resumable, with an immutable
server deadline: 90 seconds per question, bounded between 5 and 120 minutes.
The learner sees the duration before starting. Leaving the page, refreshing or
changing tabs does not reset it. The countdown is synchronized with the server
clock when the bundle is restored.

Complete challenge responses are saved automatically and remain editable before
submission. Temporary unsaved edits are kept in validated tab-local drafts;
restoring a draft never unlocks correctness. Matching and ordering use the same
backend graders as course quizzes. The initial questions, save acknowledgements
and active-attempt feedback contain no answer keys or correctness. After final
submission, the learner receives the real weighted score and earned feedback,
plus a clearly described practice readiness band (80% / 60% thresholds).

Migration 24 adds optional attempt mode, duration and deadline columns without
rewriting old records. Writes and challenge finalization lock the same attempt
row. Database-clock checks after lock acquisition reject late saves, including
requests queued before expiry. Expired attempts finalize on the next authorized
restore/save/submit; no background scheduler is needed to enforce the deadline.
The raw authenticated database role cannot create or extend a challenge or read
its stored correctness before submission. Both user and guest ownership checks
continue to apply; generation still requires an admin.

## Package export and API

`POST /api/v1/subjects/:subjectId/exam-material/:groupId/attempts`
accepts only `{ "mode": "learning" | "challenge" }`. Identity, deadline and
duration cannot be supplied by the browser. The existing attempt read, answer,
feedback and submit APIs enforce the mode centrally.

`GET /api/v1/subjects/:subjectId/exam-material/:groupId/review-package.pdf`
checks the current archive/source visibility and learner access, then renders
the stored summary, vector concept diagrams, shared references and public quiz
questions into a branded, paginated A4 PDF with embedded Arabic fonts. Every
topic, expanded detail, concept and question is included. The review PDF does
not include grading keys, rubrics or private learner responses. Downloads are
rate limited per authenticated principal and return `private, no-store`.

The Next.js proxy only permits the archive's documented paths and forwards the
verified user token or guest cookie; it does not accept caller-supplied roles or
source content for package export. The binary response is streamed to the
requesting learner. The existing summary-only/question-only PDF export remains
available separately.

## Verification

Integration tests run against an isolated migrated PostgreSQL database and cover
archive retention, role/visibility/ownership rules, simultaneous mode starts,
masked feedback, edited answers, expiry, concurrent save/finalize, database RLS
and complete branded PDF delivery. Frontend tests cover source map interaction,
voice controls and unavailable voices, autosave/retry, timer synchronization,
draft restoration, PDF retry/download and proxy validation. Browser previews use
the actual components with local fixture APIs at 1440, 882, 390 and 320 pixels in
both themes; grading/security are verified separately against the real backend.
