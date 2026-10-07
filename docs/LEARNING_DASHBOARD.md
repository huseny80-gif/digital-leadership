# Personal learning dashboard

The Arabic dashboard keeps the right sidebar and glass subject cards. Its
metrics, task statuses, deadline notifications and live search use published
platform content and the verified learner principal, including permanent guests.

## Personal metrics

`GET /api/v1/learning/overview` counts published, non-deleted lectures,
assignments and current quizzes. A linked lecture must also be published in
the same subject. Curriculum progress is completed lectures + completed
assignments + quizzes with a submitted/graded attempt, divided by all three
totals. Repeated quiz attempts do not increase curriculum completion.

Assignment completion is the learner's own acknowledgement of finishing the
task, not an uploaded submission or trainer grade. It can be undone on the
assignment page. Completion is persisted separately for users and guests.

Learning hours are active study time tracked from deployment onwards. No
historical hours are estimated from lectures, scores or guessed durations.
The client sends a heartbeat every 15 seconds on study routes, stops active
tracking when hidden or after five minutes without interaction, and never
backfills offline intervals. The server accepts only a published content id,
uses its own clock, caps each interval at 30 seconds and ignores gaps over
45 seconds. One actor clock prevents multiple tabs from double counting.

## Deadlines and tasks

Administrators can set or clear optional deadlines on the quiz create/edit
pages and in a subject's assignment deadline panel. Local inputs are sent as
explicit UTC instants. Existing content without a deadline remains undated;
deadlines are never guessed. Dates are reminders, not access restrictions.
Overdue practice and permanent guest access remain available.

The feed derives `pending`, `in_progress`, `completed` or `urgent` from the
learner's assignment progress, quiz attempts and the configured deadline.
Incomplete tasks due within 48 hours, including overdue tasks, are urgent.
Notifications contain only unfinished tasks with a configured deadline.

## Search and privacy

`GET /api/v1/search?q=...` returns at most four results per category: lectures,
summaries, quizzes and files/references. Search includes the published
Finquiz library and database content. Arabic diacritics, elongation, alif
variants and presentation ligatures are normalized. SQL is parameterized;
answer keys, private feedback and learner activity are not searchable.
The client debounces requests, aborts stale requests, supports keyboard
navigation and uses React text nodes for highlighting without inserting HTML.

Personal API/BFF responses use `Cache-Control: private, no-store`. Ownership
is resolved server-side, and the private telemetry tables have RLS enabled
without browser policies. Migration 21 is additive and idempotent; startup
applies it before serving requests. Fresh databases must apply migration 13
before 21 (see `supabase/MIGRATION_ORDER.md`). The API request budget is keyed
by verified actor so learners sharing the web proxy do not block one another.

## Appearance

Dark mode is the initial theme, with an optional remembered light preference.
Dark academic readers use restrained surfaces, pale text, comfortable line
spacing and scrollable tables. Metrics, search, notifications and activities
adapt to desktop, tablet and mobile. Navigation and focus states remain
accessible with a keyboard; existing reduced motion preferences are respected.
