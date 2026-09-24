import type { QuizAttemptResult } from "@shared/index";
import { proxyPost } from "@/lib/api/proxyPost";

/** Proxies `POST /api/v1/attempts/:attemptId/submit` (finalize + grade an
 * attempt — ASSESSMENT_API.md). The server computes and returns the
 * result; this route never calculates a score itself. */
export async function POST(_request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  return proxyPost<QuizAttemptResult>(
    `/api/v1/attempts/${attemptId}/submit`,
    {},
    "Unable to submit your quiz. Please try again.",
  );
}
