# Phase 12K — Innovation / Project-Management Overlap Decision

## Decision: **NOT_PRESENT_IN_APPROVED_DATASET**

## Evidence inspected (read-only, this phase)

1. **Source subject index** (`data/subjects/index.js`, pinned commit
   `b737ce31883bf86b3ab461b0238eb496d6e117b3`): lists exactly 5 subjects. `innovation` and
   `project-management` do **not** appear as two separate subject entries — there is a single
   entry, `innovation-project-management`, defined once.
2. **Source subject file** (`data/subjects/innovation-project-management.js`): one subject object,
   one `id`, one `title` ("الابتكار وإدارة المشاريع" — "Innovation and Project Management"), with
   4 lectures, 12 assignments, and 36 questions all nested under that single subject. There is no
   secondary "project-management" subject object anywhere in the source tree.
3. **Migration manifest / Phase 12I migration script**: mapped this single source subject to
   exactly one target `subjects` row via one `source_ref = 'finquiz:innovation-project-management'`.
4. **Target database** (`digital_leadership_phase12f`, queried fresh this phase): exactly one
   subject row with that `source_ref`, 4 lectures, 12 assignments — matching the source 1:1, with
   no second/duplicate subject and no split-then-merged rows.
5. **Phase 12J audit output**: subject-by-subject reconciliation already confirmed this subject
   1:1 with zero mismatch, corroborated independently again this phase.

## Rationale

The "overlap" language carried forward from earlier phase reports referred to a *naming*
observation (the subject's title and scope span both "innovation" and "project management" as
concepts) — not to two distinct source entities that were merged or need disambiguating. The
source data itself never modeled these as separate subjects requiring a mapping decision: it is
one subject by design, migrated as one subject. There is therefore no ambiguity to resolve
deterministically or defer to product judgment — the condition described as an "overlap" does not
exist as a data-mapping problem in the approved (pinned) dataset.

## Unresolved questions

None from a data-integrity standpoint. If the product wants to *split* this single subject into
two separate subjects in the UI in the future (a product/curriculum decision, not a migration
correctness issue), that would be new work requiring its own authorization — not a defect in
Phase 12I's migration or Phase 12J's audit.

## Future product decision required?

No. This is recorded as closed for migration-audit purposes. Any future decision to restructure
this subject into two would be a distinct, explicitly-scoped product change, not part of the
Finquiz migration's scope.
