# Migration application order

The migrations in `supabase/migrations/` must **not** be applied in plain
filename order on a fresh database. The correct order is:

```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 14 → 12 → 13
```

That is: every migration through `00000000000011_rls.sql` in its normal
numeric order, then `00000000000014_complete_assessment_schema.sql`, then
`00000000000012_quiz_attempt_answer_match_order.sql`, then
`00000000000013_rubric_and_assignments.sql`.

## Why

`00000000000012_quiz_attempt_answer_match_order.sql` creates
`quiz_attempt_answer_matches` and `quiz_attempt_answer_order_items`, and
each of those tables has a foreign key into a table that migration 12
itself assumes already exists:

- `quiz_attempt_answer_matches.question_pair_id` / `submitted_pair_id`
  reference `question_pairs (id)`
- `quiz_attempt_answer_order_items.question_item_id` references
  `question_items (id)`

Neither `question_pairs` nor `question_items` is created by any migration
numbered 1–13 — that gap is exactly what
`00000000000014_complete_assessment_schema.sql` fills (see that file's own
header comment for the full explanation of how the gap was found).
Migration 14 must therefore run **before** migration 12, even though its
filename sorts after both 12 and 13.

Migration 13 (`rubric_and_assignments`) has no dependency on 12 or 14 and
is safe to run after either; it stays last here purely to match its
existing filename-numeric position and because there is no reason to move
it earlier.

## What this file is not

This is a documentation-only workaround. Migrations 12 and 13 have **not**
been renamed, renumbered, or edited — their filenames, contents, and
numeric order relative to each other are unchanged. This file exists
because that numeric order does not equal safe *application* order for a
brand-new database, and any tooling or person applying these migrations
(via `supabase db push`, `psql -f`, or by hand) needs to know to apply
`00000000000014_complete_assessment_schema.sql` out of filename order, as
described above.

If a future phase is explicitly authorized to renumber 12/13/14 into
strict dependency order (so filename order and apply order match again),
this file should be deleted as part of that change.
