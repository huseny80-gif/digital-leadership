# Source-bound summary visuals

Each subject now has an independent **خرائط ذهنية** tab immediately after its summaries. The existing course routes and sidebar order remain intact. The three views are a collapsible summary tree, a concept hierarchy, and a sequence diagram. A selected concept reveals its approved explanation, supporting quotations, extracted-transcript line coordinates and original lecture link.

## Content and access contract

- The initial release covers the existing 27 approved lecture summaries and 492 explanatory points in `academicSummaries.json`.
- `SummaryVisualService` checks published subject/lecture visibility, then reuses `LectureSourceFiles` to verify the original PDF bytes and obtain their verified transcript. Private uploads retain their existing storage authorization. Changed bytes, ambiguous editions or unsupported quotations fail closed.
- `buildSourceSummaryVisuals` accepts only an unchanged, checksum-bound approved summary. Labels and explanations are retained; every quotation must match the corresponding transcript and have valid one-based line coordinates. These coordinates are explicitly distinguished from PDF page numbers.
- Reviewed process/history/cycle diagrams are restricted to exact ordered clauses or points in that lecture's summary. All other lectures receive an explicitly labelled source-order outline, without an inferred chronology or causal relationship. CIA and authentication relationships are limited to their reviewed cybersecurity lecture.
- Read-only endpoints: `GET /api/v1/subjects/:subjectId/mind-maps` and `GET /api/v1/subjects/:subjectId/mind-maps/:lectureId`. Both require an existing verified user or guest session and use `Cache-Control: private, no-store`. No public files, new roles, database schema or mutation endpoints are added.
- The client renders escaped React text and decorative SVG. It does not execute Mermaid/HTML from source files or send source content to a model. It loads one selected lecture at a time through the existing authenticated server-side API client.

## Interaction and verification

The viewer supports Arabic search, per-axis collapse/expand, bounded text sizing, reset, source selection and RTL keyboard tab navigation. New lecture IDs or summary revisions reset the selected concept. Small screens start with collapsed axes. SVG paths follow outside gutters so they do not imply relationships through unrelated cards. Reduced motion and visible focus are supported.

Run `summaryVisuals.test.ts` in the backend and `SubjectMindMaps.test.tsx` in the web workspace, then the existing full CI checks and production builds. The independent read-only startup stage logs `published_summary_visuals_verified`, including verified document/concept/reference counts per published subject and `ready`. It logs neither participant data nor source bodies or private URLs.
