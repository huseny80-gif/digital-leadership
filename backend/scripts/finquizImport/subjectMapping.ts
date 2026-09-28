/**
 * Phase 20.2 — approved Finquiz-subject → production-subject UUID
 * mapping (Phase 20.2-A execution plan, approved by the user).
 *
 * This is the single source of truth for "which existing production
 * subject does this Finquiz subject belong to" — no import code may
 * create a new `subjects` row; every subject-scoped row below must
 * resolve through this map instead.
 */
export const APPROVED_SUBJECT_MAPPING: Record<string, { productionId: string; matchBasis: string }> = {
  "ai-data": {
    productionId: "2d6c0980-e4d2-4687-9027-cf090b3d1a67",
    matchBasis: "exact title match",
  },
  "legal-regulatory": {
    productionId: "ade09563-02ec-4a09-a97b-58857f6cd876",
    matchBasis: "exact title match",
  },
  "cybersecurity-governance": {
    productionId: "bc861a76-620d-4646-81ca-c49d24665b75",
    matchBasis: "manual — 1-letter (أ/ا) title drift, same subject",
  },
  "innovation-project-management": {
    productionId: "7eb2b714-570f-4ed0-a00e-10efec7a20e5",
    matchBasis: "manual — 1-letter (إ/ا) title drift, same subject",
  },
  "risk-management": {
    productionId: "1f4d2071-d1c9-46ee-a848-d5c90eedf287",
    matchBasis: "manual, explicit user approval — wording differs beyond diacritics, same subject",
  },
};

export function resolveSubjectId(finquizSubjectId: string): string {
  const entry = APPROVED_SUBJECT_MAPPING[finquizSubjectId];
  if (!entry) {
    throw new Error(
      `No approved production mapping for Finquiz subject "${finquizSubjectId}" — refusing to guess or create a new subject.`,
    );
  }
  return entry.productionId;
}
