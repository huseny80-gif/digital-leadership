import { z } from "zod";

/**
 * PHASE 12H — application-layer shape validation for `questions.rubric`
 * (a jsonb column with no DB-level CHECK constraint, consistent with how
 * this schema already validates every other jsonb column's shape at the
 * application layer — see `lectures.objectives`/`lecture_items.body_json`).
 * Never used to build a learner-facing response; imported only from
 * admin-only code paths.
 */
export const rubricItemSchema = z.object({
  text: z.string().min(1),
  keywords: z.array(z.string()),
});

export const rubricSchema = z.array(rubricItemSchema).nullable();
