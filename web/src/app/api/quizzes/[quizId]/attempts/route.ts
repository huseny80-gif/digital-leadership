import type { QuizAttempt } from "@shared/index";
import { proxyPost } from "@/lib/api/proxyPost";

/** Proxies `POST /api/v1/quizzes/:quizId/attempts` (start/resume an
 * attempt — ASSESSMENT_API.md). */
export async function POST(_request: Request, context: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await context.params;
  return proxyPost<QuizAttempt>(`/api/v1/quizzes/${quizId}/attempts`, {}, "Unable to start this quiz. Please try again.");
}
