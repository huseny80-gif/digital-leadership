# Study assistant, academic reports and compact navigation

The app shell exposes **مساعدك الدراسي** as a floating glass button and **التقارير الأكاديمية** in navigation, the files hub and each subject's library. The right sidebar retains its placement. Footer **Navigate** starts collapsed, opens on activation and closes after selecting a link, pressing Escape or clicking outside; Arrow Down opens and focuses its first link.

## Published study sources

`StudySources` reads published subjects, lectures, their published summaries/library entries, and assignment instructions. Linked lecture visibility applies to summaries and assignments. It uses the existing scientific-content filter to omit assessment appendices, and the same checksum-reviewed AI PDFs used by exam materials when available. It never reads learner submissions, grades, private feedback or account records. Unreadable sources remain visible as unavailable choices rather than generating invented text.

Registered learners and valid permanent guests use the same existing principal boundary. Requests are private and uncached; client-supplied roles and source bodies are not accepted for reports. Request schemas cap selections at 20 sources and report text at 350,000 characters. Chat and report/export actions allow 20 requests per minute per verified principal; this is request throttling, not an expiry of guest access.

## Source-grounded assistant

The drawer supports concept questions, summaries of course content or pasted text, and immediate multiple-choice practice. It keeps the current conversation in browser component state and sends at most the last eight short messages. Messages are neither persisted nor logged by this feature. Clearing a conversation aborts pending requests and suppresses late responses. Practice answers and explanations appear after selection and do not alter official quiz results.

Without provider credentials, relevant original source passages form the answer with inspectable excerpts and source links. Unrelated or unreadable material produces an explicit missing-source response. Optional `CONTENT_AI_*`, `OPENAI_API_KEY`, or `NEON_AI_GATEWAY_*` server credentials enable OpenAI-compatible reformulation. Provider responses must include valid source IDs and exact quotes from the supplied passages; invalid quotes, unsupported numbers, malformed text, provider errors and a 20-second timeout use the source-only fallback. This validation does not replace scholarly review of a model's interpretation. Gateway host URLs are normalized to `/v1`. No provider credential appears in browser code.

## Reports and APA7 export

Learners retain selections across subjects, filter lectures/summaries/assignments, and enter a title, optional author name and separate personal notes. The backend organizes each subject's lectures, summaries and assignment instructions in order, produces scientific summaries using the existing compiler, and creates in-text citations and a reference list from recorded metadata. Absent authors are replaced with source titles; absent years use **د.ت.**. It does not infer authors or dates from upload time, add external sources, or produce submitted assignment answers.

The preview has content and APA7 reference tabs. Any selection or input change requires a new preview. Export re-reads publication state and source text; a SHA-256 digest binds the complete sources and report to the preview. Changed content returns 409 instead of downloading an outdated report. Exports are generated in memory and are not placed in a public/shared file store.

Word is a real DOCX archive with RTL paragraphs, 12-point Times New Roman, double spacing, page numbers, one-inch A4 margins and hanging reference indents. PDF uses embedded OFL-licensed Amiri fonts, searchable Unicode text, double-spaced body text, page numbers, Unicode bidirectional ordering and native Arabic shaping. Both formats contain the previewed sections, citations and references; reference accuracy depends on the source metadata. APA formatting is adapted to Arabic course materials.

## Floating PDF printing

Quiz runners, exam-material academic summaries, the subject's summaries library and lecture summary pages show a floating **طباعة PDF** glass button. It sits above the study assistant and mobile navigation. Question downloads include every question in the current lecture/difficulty filters, preserve delivered option/item order, and contain only public prompts and choices. Answer keys, feedback, rubrics, attempt IDs and learner inputs are not included; printing neither starts nor submits an attempt.

Summary downloads include the displayed scientific text, objectives, concepts, key points, folded topic details, HTML lists and table values. Text is not re-summarized or invented. Long paragraphs are split without dropping their tail. Attached original PDFs can be opened through their existing authorized library route for native printing. The options panel supports keyboard focus, Escape and outside-click closure, and scrolls within short screens.

`POST /print` accepts a strict `StudyPrintDocument` (kind, title, subtitle, text/heading blocks) from the authorized view and reuses the embedded-font Arabic PDF renderer. It reads no source or answer tables and stores no export. Payloads are limited to 2,000 blocks, 20,000 characters per block, 250,000 total text characters and a route-scoped 1 MB JSON body. Existing learner/guest authentication and per-principal throttling apply. Downloads are private/uncached; clients reject non-PDF responses and abort requests on unmount.

## Integration routes

All routes are under `/api/v1/study-tools` and use the existing learner/guest principal middleware:

| Method | Route | Payload or query |
| --- | --- | --- |
| GET | `/catalog` | Optional subjectId, page, limit; source choices only |
| POST | `/chat` | message, mode, optional subjectId/text/history |
| POST | `/report` | title, author, optional notes, source references (id, subjectId, kind) |
| POST | `/export?format=docx` or `pdf` | Same report input plus preview digest |
| POST | `/print` | kind (questions/summary), title, subtitle, text/heading blocks |

Next route handlers under `/api/study-tools/[action]` whitelist action/query paths, forward the verified token or guest cookie, and stream binary downloads. Error responses remain safe and JSON-shaped. There is no new database migration or production-data cleanup.

## Validation

Backend tests cover publication withdrawal, unprivileged access, payload validation, source isolation, quoted provider responses and fallback, unavailable text, reliable practice keys, metadata-only citations, deterministic preview digests, and actual DOCX/PDF files. Frontend tests cover chat submission and retry, answer-triggered feedback, aborted conversation resets, report preview/references, stale preview/export conflicts, actual Blob downloads, API query isolation and keyboard/outside-click navigation. Browser previews use the actual components with fixture APIs to inspect desktop/mobile fit; they do not impersonate a production learner session.
