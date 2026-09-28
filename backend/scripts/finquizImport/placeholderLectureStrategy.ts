/**
 * Phase 20.2-B correction #4 — a proposed visibility/archive strategy
 * for the 17 pre-existing placeholder lecture rows found in production
 * (titles like "lecture1", "Legal1"-"Legal4", "Cybersecurity1&2",
 * "Risk 1"/"Risk 2" — clearly test data, not real Finquiz content).
 *
 * This module returns a description only. It performs no database
 * operation, and Phase 20.2-B does not authorize running it — a future,
 * separately-approved phase would execute the recommended action.
 */
export interface PlaceholderLectureStrategy {
  problem: string;
  constraint: string;
  recommendedApproach: {
    mechanism: string;
    why: string;
    executionPath: string;
    schemaChangeRequired: false;
    dataLossRisk: "none";
  };
  rejectedAlternatives: Array<{ approach: string; whyRejected: string }>;
  requiresApprovalBeforeExecution: true;
}

export function describePlaceholderLectureStrategy(): PlaceholderLectureStrategy {
  return {
    problem:
      "Production's 17 existing lectures are placeholder/test rows, not real Finquiz content. An additive-only import of the real 17 lectures would leave both sets visible side by side on each subject's lecture list, which is confusing to a learner even though no data is lost or corrupted.",
    constraint:
      "This phase (and the import phase before it) explicitly forbids DELETE, TRUNCATE, and any UPDATE on existing learner data. Lectures are content, not learner-authored data, but no destructive statement is being proposed here regardless — only a visibility change, and only as a proposal.",
    recommendedApproach: {
      mechanism:
        "Set the 17 placeholder lectures' existing `status` column from 'published' to 'draft'.",
      why:
        "`lectures.status = 'draft'` already has real, tested meaning in this schema: content/contentRepository.ts's learner-facing queries add `and l.status = 'published'` for every non-admin caller, while admin queries have no such filter. A 'draft' lecture becomes invisible to learners immediately, stays fully visible and editable to admins, and remains recoverable (re-publish, edit, or delete later) — this is the exact mechanism this schema already uses for unfinished content, not a new concept.",
      executionPath:
        "The existing admin API endpoint `PATCH /admin/lectures/:lectureId` (backend/src/admin/adminRoutes.ts) already supports a status update — this would be 17 ordinary admin-authenticated PATCH calls, not a new endpoint, not raw SQL, not a schema change.",
      schemaChangeRequired: false,
      dataLossRisk: "none",
    },
    rejectedAlternatives: [
      {
        approach: "Delete the placeholder lectures",
        whyRejected: "Explicitly forbidden by this phase's own rules (no DELETE); also unverified whether any lecture_items/other references depend on them yet — would need its own dependency check first, exactly like the stub-quiz check in Phase 20.2-A.",
      },
      {
        approach: "Add a new 'archived' status value or a new column",
        whyRejected: "Would be a schema change, explicitly out of scope for a strategy that must work 'without implementing schema changes.' The existing draft/published distinction already covers the need.",
      },
      {
        approach: "Leave them untouched and do nothing",
        whyRejected: "Not incorrect, but leaves real and placeholder lecture content visibly mixed together for learners — the problem this strategy exists to address.",
      },
    ],
    requiresApprovalBeforeExecution: true,
  };
}
